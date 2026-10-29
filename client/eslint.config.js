import js from "@eslint/js"
import eslintReact from "@eslint-react/eslint-plugin"
import prettier from "eslint-config-prettier/flat"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

/**
 * Registry code, kept as shipped (see AGENTS.md), and the avatar runtime, as
 * Pipecat Character Studio exports it. Everything else is linted.
 */
const VENDORED = [
  "src/avatar-runtime/**",
  "src/components/ui/**",
  "src/components/pipecat/**",
  "src/hooks/use-pipecat-*.ts",
  "src/lib/transports.ts",
  "src/lib/visualizer.ts",
  "src/lib/utils.ts",
]

export default defineConfig([
  globalIgnores(["dist", ...VENDORED]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `onClick={() => setOpen(false)}` is idiomatic; braces add nothing.
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      // `value || fallback` on a string deliberately treats "" as unset.
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        { ignorePrimitives: { string: true } },
      ],
      // Template literals are the natural way to print numbers in UI copy.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
      eslintReact.configs["strict-type-checked"],
    ],
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      // React Compiler memoizes, so manual-memoization rules stand down.
      "react-x": { compilationMode: "infer" },
    },
  },
  {
    files: ["api/**/*.ts", "server/**/*.ts", "vite.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
])
