import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

// Hand-rolled flat config for ESLint 10. eslint-config-next bundles
// eslint-plugin-react@7.37, whose React-version detection calls the
// ESLint-10-removed context.getFilename() and crashes the linter.
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**"],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Hydrating state from localStorage/sessionStorage or syncing derived
      // state from props legitimately calls setState on mount; keep as a
      // warning so it does not fail CI.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
