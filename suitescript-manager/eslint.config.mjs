import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [{
    ignores: ["node_modules/**", "out/**"],
}, {
    files: ["**/*.ts"],
    languageOptions: {
        parser: tsParser,
        globals: {
            ...globals.node,
            ...globals.mocha,
        },

        ecmaVersion: 2022,
        sourceType: "commonjs",
        parserOptions: {
            project: "./tsconfig.json",
            tsconfigRootDir: import.meta.dirname,
        },
    },

    plugins: {
        "@typescript-eslint": tsPlugin,
    },

    rules: {
        "no-const-assign": "warn",
        "no-this-before-super": "warn",
        "no-unreachable": "warn",
        "constructor-super": "warn",
        "valid-typeof": "warn",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    },
}];
