const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

class SyncStatusProvider {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    /**
     * @param {{ type: "env" | "file", label: string, resourceUri?: vscode.Uri, envName?: string, configured?: boolean, status?: string }} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
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

        const status = element.status || "unknown";
        if (status === "in-sync") {
            item.iconPath = new vscode.ThemeIcon("check");
            item.description = `${element.envName} • in sync`;
        } else if (status === "dirty") {
            item.iconPath = new vscode.ThemeIcon("circle-filled");
            item.description = `${element.envName} • local changes`;
        } else {
            item.iconPath = new vscode.ThemeIcon("question");
            item.description = `${element.envName} • unknown`;
        }

        return item;
    }

    /**
     * @param {{ type: "env" | "file", label: string, resourceUri?: vscode.Uri, envName?: string, configured?: boolean, status?: string } | undefined} element
     * @returns {Promise<Array<any>>}
     */
    async getChildren(element) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        if (!element) {
            return this.#getEnvironmentNodes(workspaceFolder);
        }

        if (element.type === "env") {
            return this.#getFileNodesForEnv(workspaceFolder, element.label);
        }

        return [];
    }

    async #getEnvironmentNodes(workspaceFolder) {
        const EXCLUDED = new Set(["node_modules", "Backup", ".git", ".vscode", ".idea"]);
        const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);

        const folders = entries
            .filter(([name, type]) =>
                type === vscode.FileType.Directory &&
                !name.startsWith(".") &&
                !EXCLUDED.has(name),
            )
            .map(([name]) => name);

        const config = await this.#loadConfig(workspaceFolder.uri.fsPath);
        const configuredEnvs = config ? Object.keys(config) : [];

        const allEnvNames = Array.from(new Set([...folders, ...configuredEnvs])).sort();

        return allEnvNames.map((envName) => ({
            type: "env",
            label: envName,
            configured: configuredEnvs.includes(envName),
        }));
    }

    async #getFileNodesForEnv(workspaceFolder, envName) {
        const pattern = new vscode.RelativePattern(workspaceFolder, `${envName}/**/*.js`);
        const files = await vscode.workspace.findFiles(pattern);

        const nodes = [];

        for (const uri of files) {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            const label = relativePath.split(path.sep).slice(1).join(path.sep) || path.basename(uri.fsPath);

            const status = await this.#getFileStatus(envName, relativePath, uri);

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

    async #loadConfig(workspacePath) {
        const configPath = path.join(workspacePath, ".ss-manager.json");
        try {
            await fs.promises.access(configPath, fs.constants.F_OK);
        } catch {
            return null;
        }

        try {
            const raw = await fs.promises.readFile(configPath, "utf-8");
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    async #getFileStatus(envName, relativePath, uri) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return "unknown";
        }

        const key = `ssm:lastPush:${envName}:${relativePath}`;
        const lastPush = this.context.globalState.get(key);

        let mtimeMs;
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            mtimeMs = stat.mtime;
        } catch {
            return "unknown";
        }

        if (!lastPush || typeof lastPush.ts !== "number") {
            return "unknown";
        }

        if (mtimeMs > lastPush.ts) {
            return "dirty";
        }

        return "in-sync";
    }
}

module.exports = SyncStatusProvider;

