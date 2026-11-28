/** Checks accessible React and enforces the library's consumer-facing package boundary. */
import shared from "../../packages/chulane_ui/eslint.config.js";
export default [
  ...shared,
  { ignores: ["src/examples/knowledge-workspace/resizable.tsx"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/*", "**/packages/chulane_ui/**", "@chulane/ui/src/*", "@chulane/ui/dist/*"],
        },
      ],
    },
  },
];
