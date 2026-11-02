// Shared ESLint flat config for the whole monorepo. The root eslint.config.js re-exports it.
import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { boundaryConfigs } from "./boundaries.js";
import { styleConfigs } from "./no-raw-style-values.js";

export default defineConfig(
  {
    name: "clever/ignores",
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/generated/**",
      "**/next-env.d.ts",
      ".specify/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: "clever/node-globals",
    languageOptions: { globals: { ...globals.node } },
  },
  {
    name: "clever/browser-globals",
    files: ["apps/web/**", "packages/ui/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Constitution XI and FR-096: accessibility rules for every screen and shared component.
    ...jsxA11y.flatConfigs.recommended,
    name: "clever/jsx-a11y",
    files: ["apps/web/**/*.{jsx,tsx}", "packages/ui/**/*.{jsx,tsx}"],
  },
  {
    name: "clever/typescript",
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Constitution XII: observability goes through the error translators, not console.
      "no-console": "error",
    },
  },
  ...boundaryConfigs,
  ...styleConfigs,
);
