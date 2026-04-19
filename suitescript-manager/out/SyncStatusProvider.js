"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
class SyncStatusProvider {
    context;
    onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    constructor(context) {
        this.context = context;
    }
    // Triggers a refresh when tree data may have changed.
    refresh() {
        this.onDidChangeTreeDataEmitter.fire();
    }
    // Builds the tree item visuals for environment nodes and file nodes.
    getTreeItem(element) {
        if (element.type === "env") {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
            item.contextValue = "ssm-env";
            item.description = element.configured ? "configured" : "not configured";
            item.iconPath = new vscode.ThemeIcon(element.configured ? "cloud-upload" : "warning");
            return item;
        }
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
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
        }
        else if (element.status === "dirty") {
            item.iconPath = new vscode.ThemeIcon("circle-filled");
            item.description = `${element.envName} - local changes`;
        }
        else {
            item.iconPath = new vscode.ThemeIcon("question");
            item.description = `${element.envName} - unknown`;
        }
        return item;
    }
    // Returns top-level environments first, then files when a specific environment expands.
    async getChildren(element) {
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
    // Merges filesystem folders and configured environments into one sorted root tree.
    async getEnvironmentNodes(workspaceFolder) {
        const excluded = new Set(["node_modules", "Backup", ".git", ".vscode", ".idea"]);
        const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
        const folders = entries
            .filter(([name, type]) => type === vscode.FileType.Directory &&
            !name.startsWith(".") &&
            !excluded.has(name))
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
    // Lists JavaScript files inside one environment folder and annotates each with sync status.
    async getFileNodesForEnv(workspaceFolder, envName) {
        const pattern = new vscode.RelativePattern(workspaceFolder, `${envName}/**/*.js`);
        const files = await vscode.workspace.findFiles(pattern);
        const nodes = [];
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
    // Reads the workspace configuration opportunistically so the tree can show configured environments.
    async loadConfig(workspacePath) {
        const configPath = path.join(workspacePath, ".ss-manager.json");
        try {
            await fs.promises.access(configPath, fs.constants.F_OK);
            const raw = await fs.promises.readFile(configPath, "utf-8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    // Compares the file mtime against the last successful push timestamp stored in global state.
    async getFileStatus(envName, relativePath, uri) {
        const key = `ssm:lastPush:${envName}:${relativePath}`;
        const lastPush = this.context.globalState.get(key);
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (!lastPush || typeof lastPush.ts !== "number") {
                return "unknown";
            }
            return stat.mtime > lastPush.ts ? "dirty" : "in-sync";
        }
        catch {
            return "unknown";
        }
    }
}
exports.default = SyncStatusProvider;
//# sourceMappingURL=SyncStatusProvider.js.map