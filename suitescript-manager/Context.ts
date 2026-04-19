import * as path from "node:path";
import * as vscode from "vscode";
import { AuthService } from "./AuthService";
import ConfigService from "./ConfigService";
import type { ExtensionContextData, NetSuiteConfig } from "./types";

// Reuses the single configured environment automatically, otherwise asks the user to choose one.
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

// Loads and validates the workspace config file, caching it until the file changes on disk.
async function loadConfig(): Promise<NetSuiteConfig> {
    return await ConfigService.loadConfig();
}

// Collects the active editor, environment, and auth details that command handlers depend on.
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

    let config: NetSuiteConfig;
    try {
        config = await loadConfig();
    } catch (error) {
        throw new Error(".ss-manager.json not found or invalid");
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
