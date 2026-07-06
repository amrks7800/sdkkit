import * as fs from "fs";
import * as path from "path";
import { Project, SyntaxKind } from "ts-morph";
import type { PropertyAccessExpression, MethodDeclaration } from "ts-morph";
import { generateExampleFromType } from "./type-resolver";

export interface PostmanHeader {
  key: string;
  value: string;
  type: string;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  variable?: { key: string; value: string; description?: string }[];
}

export interface PostmanBody {
  mode: string;
  raw?: string;
  options?: {
    raw: {
      language: string;
    };
  };
}

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  body?: PostmanBody;
}

export interface PostmanResponse {
  name: string;
  originalRequest?: PostmanRequest;
  status: string;
  code: number;
  header: PostmanHeader[];
  body: string;
}

export interface PostmanItem {
  name: string;
  request: PostmanRequest;
  response?: PostmanResponse[];
}

export interface PostmanFolder {
  name: string;
  item: PostmanItem[];
}

export interface PostmanCollection {
  info: {
    name: string;
    schema: string;
  };
  item: PostmanFolder[];
  variable: { key: string; value: string; type: string }[];
}

export interface PostmanGeneratorConfig {
  tsConfigPath: string;
  serviceGlobs: string[];
  collectionName: string;
  baseUrl?: string;
  outputPath: string;
}

/**
 * Resolves path template variables from TypeScript template expressions to Postman variables.
 * E.g., `/vehicles/${id}/location` -> `/vehicles/:id/location`
 */
function cleanUrlPath(rawPath: string): { cleanPath: string; variables: string[] } {
  // Remove string literal quotes
  let cleaned = rawPath.replace(/['"`]/g, "");

  // Convert template literals ${id} to :id
  const variables: string[] = [];
  const matches = cleaned.match(/\$\{([^}]+)\}/g);
  if (matches) {
    matches.forEach((m) => {
      const varName = m.slice(2, -1);
      variables.push(varName);
      cleaned = cleaned.replace(m, `:${varName}`);
    });
  }

  return { cleanPath: cleaned, variables };
}

/**
 * Generates a Postman v2.1.0 collection automatically by parsing Service classes and HTTP call ASTs.
 */
export function generatePostmanCollection(config: PostmanGeneratorConfig): void {
  const project = new Project({
    tsConfigFilePath: config.tsConfigPath,
  });

  const sourceFiles = project.addSourceFilesAtPaths(config.serviceGlobs);

  const collection: PostmanCollection = {
    info: {
      name: config.collectionName,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [],
    variable: [
      {
        key: "baseUrl",
        value: config.baseUrl ?? "http://localhost:3000/api",
        type: "string",
      },
    ],
  };

  for (const sourceFile of sourceFiles) {
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      // Only process classes extending BaseService
      const baseClass = cls.getBaseClass();
      if (!baseClass || baseClass.getName() !== "BaseService") {
        continue;
      }

      const folderName = cls.getName() ?? sourceFile.getBaseNameWithoutExtension();

      // Retrieve the basePath property value
      let basePath = "";
      const basePathProp = cls.getProperty("basePath");
      if (basePathProp) {
        const init = basePathProp.getInitializer();
        if (init) {
          basePath = init.getText().replace(/['"`]/g, "");
        }
      }

      const folderItem: PostmanFolder = {
        name: folderName,
        item: [],
      };

      const methods = cls.getMethods();
      for (const method of methods) {
        const methodName = method.getName();
        // Skip React hooks
        if (methodName.startsWith("use")) {
          continue;
        }

        processMethod(method, basePath, folderItem);
      }

      if (folderItem.item.length > 0) {
        collection.item.push(folderItem);
      }
    }
  }

  const resolvedOutputPath = path.resolve(config.outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(collection, null, 2), "utf8");
}

function processMethod(
  method: MethodDeclaration,
  basePath: string,
  folderItem: PostmanFolder
): void {
  const callExpressions = method.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const callExpr of callExpressions) {
    const expression = callExpr.getExpression();
    if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) {
      continue;
    }

    const propAccess = expression as PropertyAccessExpression;
    const text = propAccess.getText(); // E.g., "this.http.get" or "this.http.request"

    // Match supported HTTP client call signatures
    const match = text.match(/this\.http\.(get|post|put|patch|delete|request)/);
    if (!match) {
      continue;
    }

    const clientMethod = match[1];
    const args = callExpr.getArguments();
    if (args.length === 0) {
      continue;
    }

    let httpMethod = clientMethod.toUpperCase();
    let subPath = "";
    let payloadNode: import("ts-morph").Node | undefined;

    // Handle `request` signature: this.http.request({ method: 'POST', url: this.url('/...'), data: ... })
    if (clientMethod === "request" && args.length === 1) {
      const configArg = args[0];
      if (configArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const objExpr = configArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        
        // Extract HTTP method from request config object
        const methodProp = objExpr.getProperty("method");
        if (methodProp && methodProp.getKind() === SyntaxKind.PropertyAssignment) {
          httpMethod = methodProp
            .asKindOrThrow(SyntaxKind.PropertyAssignment)
            .getInitializer()
            ?.getText()
            .replace(/['"`]/g, "")
            .toUpperCase() ?? "GET";
        }

        // Extract subPath from request config object
        const urlProp = objExpr.getProperty("url");
        if (urlProp && urlProp.getKind() === SyntaxKind.PropertyAssignment) {
          const init = urlProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
          if (init) {
            subPath = extractUrlFromInitializer(init);
          }
        }

        // Extract payload config for post/put/patch
        const dataProp = objExpr.getProperty("data");
        if (dataProp && dataProp.getKind() === SyntaxKind.PropertyAssignment) {
          payloadNode = dataProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
        }
      }
    } else {
      // Handle standard get/post/put/patch/delete signatures: this.http.post(this.url('/...'), data, config)
      const urlArg = args[0];
      subPath = extractUrlFromInitializer(urlArg);

      if (httpMethod !== "GET" && args.length > 1) {
        payloadNode = args[1];
      }
    }

    // Resolve URL path
    const resolvedPath = path.posix.join(basePath, subPath);
    const { cleanPath, variables } = cleanUrlPath(resolvedPath);
    const urlParts = cleanPath.split("/").filter((p) => p.length > 0);

    const postmanRequest: PostmanRequest = {
      method: httpMethod,
      header: [
        {
          key: "Content-Type",
          value: "application/json",
          type: "text",
        },
      ],
      url: {
        raw: `{{baseUrl}}/${cleanPath}`,
        host: ["{{baseUrl}}"],
        path: urlParts,
      },
    };

    // Configure path variables in URL
    if (variables.length > 0) {
      postmanRequest.url.variable = variables.map((v) => ({
        key: v,
        value: "",
        description: `URL parameter: ${v}`,
      }));
    }

    // Parse payload schema for body example
    if (payloadNode && (httpMethod === "POST" || httpMethod === "PUT" || httpMethod === "PATCH")) {
      const type = payloadNode.getType();
      postmanRequest.body = {
        mode: "raw",
        raw: JSON.stringify(generateExampleFromType(type, payloadNode), null, 2),
        options: { raw: { language: "json" } },
      };
    }

    const endpointItem: PostmanItem = {
      name: method.getName(),
      request: postmanRequest,
      response: [],
    };

    // Parse response generic type for mock response generation
    const typeArgs = callExpr.getTypeArguments();
    if (typeArgs.length > 0) {
      const responseType = typeArgs[0].getType();
      const mockResponseBody = generateExampleFromType(responseType, callExpr);

      endpointItem.response = [
        {
          name: "Successful Response",
          originalRequest: postmanRequest,
          status: "OK",
          code: 200,
          header: [
            {
              key: "Content-Type",
              value: "application/json",
              type: "text",
            },
          ],
          body: JSON.stringify(mockResponseBody, null, 2),
        },
      ];
    }

    folderItem.item.push(endpointItem);
  }
}

/**
 * Extracts subpaths from string literals or this.url(...) calls.
 */
function extractUrlFromInitializer(node: import("ts-morph").Node): string {
  if (
    node.getKind() === SyntaxKind.StringLiteral ||
    node.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
  ) {
    return node.getText().replace(/['"`]/g, "");
  }

  if (node.getKind() === SyntaxKind.CallExpression) {
    const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression);
    const callText = callExpr.getExpression().getText();

    // Check if it's calling this.url(...)
    if (callText === "this.url") {
      const callArgs = callExpr.getArguments();
      if (callArgs.length > 0) {
        return callArgs[0].getText().replace(/['"`]/g, "");
      }
      return "";
    }
  }

  // Fallback to literal representation if not matched
  return node.getText().replace(/['"`]/g, "");
}
