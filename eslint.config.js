import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["client/src/**/*.ts", "client/src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Direct fetch() is banned. Use apiRequest() or apiRequestJson() from @/lib/queryClient instead.",
        },
        {
          selector:
            "MemberExpression[object.name='window'][property.name='fetch']",
          message:
            "Direct window.fetch() is banned. Use apiRequest() or apiRequestJson() from @/lib/queryClient instead.",
        },
      ],
    },
  },
  {
    files: ["client/src/lib/queryClient.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  {
    files: ["server/routes.ts", "server/routes/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "./db",
              message:
                "Do not import db directly in routes. Use storage/service methods instead.",
            },
            {
              name: "../db",
              message:
                "Do not import db directly in routes. Use storage/service methods instead.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["server/**/*.ts"],
    ignores: ["server/finance-helpers.ts", "server/db.ts", "server/**/*.test.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Number'][callee.property.name='toFixed']",
          message:
            "Use roundMoney() or roundQty() from server/finance-helpers.ts instead of Number.toFixed().",
        },
      ],
    },
  },
];
