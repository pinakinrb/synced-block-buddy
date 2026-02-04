// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Convert recommended config rules to flat config format
// The recommended config is just a rules object, not a full flat config
// Rules are already in "obsidianmd/rule-name" format which is correct for flat config
const recommendedRules = obsidianmd.configs?.recommended || {};

export default defineConfig([
  {
    plugins: {
      obsidianmd: obsidianmd,
    },
    // Apply all recommended rules to TypeScript source files only
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rules: recommendedRules as any,
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      // Enforce strict sentence case for all UI text
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          brands: [],
          acronyms: ["OK"],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
]);