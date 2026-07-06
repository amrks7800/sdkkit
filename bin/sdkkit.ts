import { generatePostmanCollection } from "../src/codegen/postman";

function printHelp(): void {
  console.log(`
sdkkit CLI Utility

Usage:
  npx sdkkit generate-postman [options]

Options:
  --tsconfig <path>     Path to tsconfig.json (default: ./tsconfig.json)
  --services <glob>     Glob pattern for service file sources (default: src/services/**/*.ts)
  --name <string>       Name of the Postman Collection (default: API Collection)
  --base-url <url>      Mock Base URL value for Postman variables (default: http://localhost:3000/api)
  --output <path>       Output JSON file path (default: ./postman_collection.json)
  -h, --help            Print usage manual
`);
}

function run(): void {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const getArgValue = (flag: string, defaultValue: string): string => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return defaultValue;
  };

  const command = args[0];
  if (command !== "generate-postman") {
    console.error(`Unknown command: ${command ?? ""}`);
    printHelp();
    process.exit(1);
  }

  const tsConfigPath = getArgValue("--tsconfig", "./tsconfig.json");
  const servicesGlob = getArgValue("--services", "src/services/**/*.ts");
  const collectionName = getArgValue("--name", "API Collection");
  const baseUrl = getArgValue("--base-url", "http://localhost:3000/api");
  const outputPath = getArgValue("--output", "./postman_collection.json");

  console.log(`[sdkkit] Generating Postman Collection...`);
  console.log(`- tsconfig: ${tsConfigPath}`);
  console.log(`- services: ${servicesGlob}`);
  console.log(`- collection name: ${collectionName}`);
  console.log(`- base URL: ${baseUrl}`);
  console.log(`- output: ${outputPath}`);

  try {
    generatePostmanCollection({
      tsConfigPath,
      serviceGlobs: [servicesGlob],
      collectionName,
      baseUrl,
      outputPath,
    });
    console.log(`[sdkkit] ✓ Generated collection successfully at ${outputPath}`);
  } catch (error) {
    console.error(`[sdkkit] ✗ Failed to generate Postman collection:`, error);
    process.exit(1);
  }
}

run();
