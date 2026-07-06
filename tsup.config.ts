import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry (core + factory)
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["axios", "react", "@tanstack/react-query", "ts-morph"],
  },
  // React subpath
  {
    entry: { react: "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["axios", "react", "@tanstack/react-query", "ts-morph"],
  },
  // Codegen subpath
  {
    entry: { codegen: "src/codegen/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["axios", "react", "@tanstack/react-query"],
  },
  // CLI binary
  {
    entry: { "bin/sdkkit": "bin/sdkkit.ts" },
    format: ["esm"],
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
    external: ["axios", "react", "@tanstack/react-query"],
  },
]);
