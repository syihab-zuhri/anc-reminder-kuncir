import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "apps/web/**",
      "apps/android/android/**",
      "packages/database/migrations/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["apps/{api,worker,android}/**/*.ts", "packages/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/android/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anc/database",
              message: "The Android shell must access data through the server API.",
            },
            {
              name: "@anc/config",
              message: "Server runtime configuration must not ship in the Android shell.",
            },
          ],
        },
      ],
    },
  },
);
