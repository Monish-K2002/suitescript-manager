import * as fs from "node:fs";
import * as path from "node:path";

import Ajv from "ajv";
import * as vscode from "vscode";

import { AuthService } from "./AuthService";
import type { ExtensionContextData, NetSuiteConfig } from "./types";

const ajv = new Ajv();
const configCache = new Map<string, { mtimeMs: number; config: NetSuiteConfig }>();

const schema = {
    type: "object",
    patternProperties: {
        ".*": {
            type: "object",
            properties: {
                CLIENT_ID: { type: "string" },
                CLIENT_SECRET: { type: "string" },
                ACCESS_TOKEN: { type: "string" },
                ACCESS_SECRET: { type: "string" },
                REALM: { type: "string" },
                URL: { type: "string" },
            },
            required: ["CLIENT_ID", "CLIENT_SECRET", "ACCESS_TOKEN", "ACCESS_SECRET", "REALM", "URL"],
            additionalProperties: true,
        },
    },
    additionalProperties: false,
    minProperties: 1,
} as const;

const validate = ajv.compile(schema);

async function pickEnvironment(config: NetSuiteConfig): Promise<string> {
    const environments = Object.keys(config);

    if (!environments.length) {
        throw new Error("No environments found in .ss-manager.json");
    }

    if (environments.length === 1) {
        return environments[0];
    }

    const selected = await vscode.window.showQuickPick(environments, {
        placeHolder: "Select NetSuite environment",
    });

    if (!selected) {
        throw new Error("Environment selection cancelled");
    }

    return selected;
}

async function loadConfig(): Promise<NetSuiteConfig | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return null;
    }

    const configPath = path.join(workspaceFolder.uri.fsPath, ".ss-manager.json");
    if (!fs.existsSync(configPath)) {
        return null;
    }

    const mtimeMs = (await fs.promises.stat(configPath)).mtimeMs;
    const cached = configCache.get(configPath);
    if (cached && cached.mtimeMs === mtimeMs) {
        return cached.config;
    }

    const fileContent = await fs.promises.readFile(configPath, "utf-8");
    const parsedConfig: unknown = JSON.parse(fileContent);
    if (!validate(parsedConfig)) {
        throw new Error(`Invalid config format: ${ajv.errorsText(validate.errors)}`);
    }

    const config = parsedConfig as NetSuiteConfig;
    configCache.set(configPath, { mtimeMs, config });
    return config;
}

export async function getContext(activeRequired = true, getProduction = false): Promise<ExtensionContextData> {
    const editor = vscode.window.activeTextEditor;
    if (activeRequired && !editor) {
        throw new Error("No active editor found");
    }

    const filePath = editor?.document.fileName;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error("No workspace folder open");
    }

    const config = await loadConfig();
    if (!config) {
        throw new Error(".ss-manager.json not found");
    }

    const parts = filePath ? filePath.split(path.sep) : [];
    const envIndex = parts.findIndex((segment) => segment === workspaceFolder.name) + 1;

    let environment = activeRequired ? parts[envIndex] : await pickEnvironment(config);
    if (getProduction) {
        environment = Object.keys(config).find(
            (env) =>
                env.toLowerCase().includes("prod") ||
                env.toLowerCase().includes("production"),
        ) ?? "";

        if (!environment) {
            throw new Error("Production environment not configured");
        }
    }

    if (!environment || !config[environment]) {
        throw new Error(`Environment "${environment}" not configured in .ss-manager.json`);
    }

    return {
        editor,
        filePath,
        fileName: path.basename(filePath ?? ""),
        environment,
        config,
        auth: new AuthService(config[environment]),
        envIndex,
        parts,
    };
}
