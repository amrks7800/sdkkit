import type { Type, Node } from "ts-morph";

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Recursively resolves a ts-morph Type into a mock JSON value for documentation and example payloads.
 * Avoids the use of 'any' or 'as any' by using a strongly-typed JSON structure.
 */
export function generateExampleFromType(
  type: Type,
  node: Node,
  depth: number = 0
): JsonValue {
  if (depth > 5) {
    return {};
  }

  // 1. Primitive checks
  if (type.isString() || type.isStringLiteral()) {
    return "string";
  }
  if (type.isNumber() || type.isNumberLiteral()) {
    return 0;
  }
  if (type.isBoolean() || type.isBooleanLiteral()) {
    return true;
  }
  if (type.isNull() || type.isUndefined()) {
    return null;
  }

  // 2. Array handling
  if (type.isArray()) {
    const elementType = type.getArrayElementType();
    return elementType
      ? [generateExampleFromType(elementType, node, depth + 1)]
      : [];
  }

  // 3. Union handling
  if (type.isUnion()) {
    const nonNullable = type.getNonNullableType();
    if (nonNullable.isUnion()) {
      const activeType = nonNullable
        .getUnionTypes()
        .find((t) => !t.isUndefined() && !t.isNull());
      return activeType
        ? generateExampleFromType(activeType, node, depth + 1)
        : null;
    }
    return generateExampleFromType(nonNullable, node, depth + 1);
  }

  // 4. File / FormData special check
  const typeText = type.getText();
  const symbolName = type.getSymbol()?.getName();
  if (
    typeText.includes("FormData") ||
    symbolName === "FormData" ||
    typeText.includes("File") ||
    symbolName === "File" ||
    typeText.includes("SdkImage") ||
    symbolName === "SdkImage" ||
    typeText.includes("UniversalFile") ||
    symbolName === "UniversalFile"
  ) {
    return { file: "binary" };
  }

  // 5. Object / Class interface property traversal
  const props = type.getProperties();
  if (props.length > 0) {
    const result: JsonObject = {};
    for (const prop of props) {
      const propName = prop.getName();
      // Skip methods, private fields, and common collection helper properties
      if (
        propName.startsWith("_") ||
        [
          "append",
          "delete",
          "get",
          "getAll",
          "has",
          "set",
          "forEach",
          "entries",
          "keys",
          "values",
        ].includes(propName)
      ) {
        continue;
      }

      const propType = type.getProperty(propName)?.getTypeAtLocation(node);
      if (propType) {
        result[propName] = generateExampleFromType(propType, node, depth + 1);
      }
    }
    return result;
  }

  return {};
}
