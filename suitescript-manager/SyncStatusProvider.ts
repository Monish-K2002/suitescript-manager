import * as fs from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

import type { NetSuiteConfig, SyncStatus, SyncTreeNode } from "./types";

class SyncStatusProvider implements vscode.TreeDataProvider<SyncTreeNode> {
    private readonly context: vscode.ExtensionContext;

    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SyncTreeNode | undefined | void>();

    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    public constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    public getTreeItem(element: SyncTreeNode): vscode.TreeItem {
        if (element.type === "env") {
            const item = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Collapsed,
            );
            item.contextValue = "ssm-env";
            item.description = element.configured ? "configured" : "not configured";
            item.iconPath = new vscode.ThemeIcon(
                element.configured ? "cloud-upload" : "warning",
            );
            return item;
        }

        const item = new vscode.TreeItem(
            element.label,
            vscode.TreeItemCollapsibleState.None,
        );
        item.contextValue = "ssm-file";
        item.resourceUri = element.resourceUri;
        item.command = {
            command: "vscode.open",
            title: "Open File",
            arguments: [element.resourceUri],
        };

        if (element.status === "in-sync") {
            item.iconPath = new vscode.ThemeIcon("check");
            item.description = `${element.envName} - in sync`;
        } else if (element.status === "dirty") {
            item.iconPath = new vscode.ThemeIcon("circle-filled");
            item.description = `${element.envName} - local changes`;
        } else {
            item.iconPath = new vscode.ThemeIcon("question");
            item.description = `${element.envName} - unknown`;
        }

        return item;
    }

    public async getChildren(element?: SyncTreeNode): Promise<SyncTreeNode[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        if (!element) {
            return this.getEnvironmentNodes(workspaceFolder);
        }

        if (element.type === "env") {
            return this.getFileNodesForEnv(workspaceFolder, element.label);
        }

        return [];
    }

    private async getEnvironmentNodes(workspaceFolder: vscode.WorkspaceFolder): Promise<SyncTreeNode[]> {
        const excluded = new Set(["node_modules", "Backup", ".git", ".vscode", ".idea"]);
        const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
        const folders = entries
            .filter(([name, type]) =>
                type === vscode.FileType.Directory &&
                !name.startsWith(".") &&
                !excluded.has(name),
            )
            .map(([name]) => name);

        const config = await this.loadConfig(workspaceFolder.uri.fsPath);
        const configuredEnvs = config ? Object.keys(config) : [];
        const allEnvNames = Array.from(new Set([...folders, ...configuredEnvs])).sort();

        return allEnvNames.map((envName) => ({
            type: "env",
            label: envName,
            configured: configuredEnvs.includes(envName),
        }));
    }

    private async getFileNodesForEnv(
        workspaceFolder: vscode.WorkspaceFolder,
        envName: string,
    ): Promise<SyncTreeNode[]> {
        const pattern = new vscode.RelativePattern(workspaceFolder, `${envName}/**/*.js`);
        const files = await vscode.workspace.findFiles(pattern);

        const nodes: SyncTreeNode[] = [];
        for (const uri of files) {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            const label = relativePath.split(path.sep).slice(1).join(path.sep) || path.basename(uri.fsPath);
            const status = await this.getFileStatus(envName, relativePath, uri);

            nodes.push({
                type: "file",
                label,
                resourceUri: uri,
                envName,
                status,
            });
        }

        return nodes;
    }

    private async loadConfig(workspacePath: string): Promise<NetSuiteConfig | null> {
        const configPath = path.join(workspacePath, ".ss-manager.json");

        try {
            await fs.promises.access(configPath, fs.constants.F_OK);
            const raw = await fs.promises.readFile(configPath, "utf-8");
            return JSON.parse(raw) as NetSuiteConfig;
        } catch {
            return null;
        }
    }

    private async getFileStatus(envName: string, relativePath: string, uri: vscode.Uri): Promise<SyncStatus> {
        const key = `ssm:lastPush:${envName}:${relativePath}`;
        const lastPush = this.context.globalState.get<{ ts?: number }>(key);

        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (!lastPush || typeof lastPush.ts !== "number") {
                return "unknown";
            }

            return stat.mtime > lastPush.ts ? "dirty" : "in-sync";
        } catch {
            return "unknown";
        }
    }
}

export default SyncStatusProvider;
