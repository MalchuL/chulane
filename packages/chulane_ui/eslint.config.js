/** Lints the UI package and its Vite preview. */
import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import prettier from "eslint-config-prettier/flat";
import js from "@eslint/js";
import a11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const methodDocumentation = {
  enableFixer: false,
  exemptEmptyConstructors: false,
  exemptEmptyFunctions: false,
  checkConstructors: true,
  checkGetters: true,
  checkSetters: true,
  contexts: [
    "Property[method=true]",
    "TSMethodSignature",
    "PropertyDefinition[value.type='ArrowFunctionExpression']",
    "PropertyDefinition[value.type='FunctionExpression']",
  ],
  require: {
    FunctionDeclaration: false,
    MethodDefinition: true,
  },
};

export default defineConfig([
  globalIgnores([
    "src/components/ui/**",
    "src/hooks/use-mobile.ts",
    "**/dist/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/test-results/**",
    "**/playwright-report/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { jsdoc },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-nested-ternary": "error",
      "max-lines-per-function": ["warn", 50],
      "jsdoc/require-jsdoc": ["error", methodDocumentation],
      "@typescript-eslint/member-ordering": [
        "error",
        {
          default: {
            memberTypes: [
              [
                "signature",
                "call-signature",
                "field",
                "accessor",
                "static-initialization",
                "constructor",
                "get",
                "set",
                "public-method",
                "protected-method",
              ],
              ["private-method", "#private-method"],
            ],
          },
          interfaces: "never",
          typeLiterals: "never",
        },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSImportType",
          message: "Declare the dependency at the top of the module using import type.",
        },
        {
          selector: "ImportExpression",
          message: "Use a static import at the top of the module.",
        },
        {
          selector:
            "Program > :not(ImportDeclaration, ExpressionStatement[directive]) ~ ImportDeclaration",
          message: "Keep all imports before declarations and re-exports.",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { "jsx-a11y": a11y },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "no-restricted-imports": ["error", { patterns: ["@/*"] }],
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/anchor-has-content": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "react-refresh/only-export-components": "off",
    },
  },
  prettier,
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      curly: ["error", "all"],
      "@stylistic/curly-newline": ["error", { minElements: 1, consistent: true }],
    },
  },
]);
