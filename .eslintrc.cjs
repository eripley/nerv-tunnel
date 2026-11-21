// Airbnb owns the lint rules. Prettier handles whitespace and wrapping.
module.exports = {
  root: true,
  env: { node: true, es2022: true, browser: false },
  extends: ["airbnb", "airbnb/hooks", "prettier"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: {
    react: { version: "detect" },
    "import/resolver": { typescript: {}, node: true },
  },
  rules: {
    // Node ESM requires explicit relative import extensions at runtime.
    "import/extensions": [
      "error",
      "ignorePackages",
      { js: "always", mjs: "always" },
    ],
    // Node supports native iterators. Service lifecycle operations must run in order.
    "no-restricted-syntax": [
      "error",
      "ForInStatement",
      "LabeledStatement",
      "WithStatement",
    ],
  },
  overrides: [
    {
      files: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts", "test/**/*.ts"],
      parser: "@typescript-eslint/parser",
      extends: ["plugin:@typescript-eslint/recommended", "prettier"],
      rules: {
        // NodeNext checks relative extensions against the emitted JS filename.
        "import/extensions": "off",
        "no-void": ["error", { allowAsStatement: true }],
        "no-shadow": "off",
        "@typescript-eslint/no-shadow": "error",
        "no-use-before-define": "off",
        "@typescript-eslint/no-use-before-define": [
          "error",
          { functions: false, typedefs: false },
        ],
        "react/jsx-filename-extension": ["error", { extensions: [".tsx"] }],
        "react/require-default-props": [
          "error",
          { functions: "defaultArguments" },
        ],
      },
    },
    { files: ["src/cli.tsx"], rules: { "no-console": "off" } },
    {
      files: ["test/**/*.ts", "scripts/**/*.ts", "*.cjs"],
      rules: {
        "import/no-extraneous-dependencies": [
          "error",
          { devDependencies: true },
        ],
      },
    },
  ],
};
