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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const CacheService_1 = __importDefault(require("./CacheService"));
const Context_1 = require("./Context");
const Request_1 = require("./Request");
const Utils_1 = __importDefault(require("./Util/Utils"));
class CommandHandler {
    extensionContext;
    cache;
    cacheTtlMs = {
        getSearchList: 6 * 60 * 60 * 1000,
        previewSearch: 15 * 60 * 1000,
        getScriptId: 30 * 24 * 60 * 60 * 1000,
    };
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        this.cache = new CacheService_1.default(extensionContext.globalState);
    }
    async runTask(task) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "SuiteScript Manager",
            cancellable: false,
        }, async (progress) => {
            try {
                await task(progress);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Operation failed: ${this.getErrorMessage(error)}`);
                console.error(error);
            }
        });
    }
    async handlePushCode(progress) {
        progress.report({ message: "Preparing context..." });
        const ctx = await (0, Context_1.getContext)();
        if (["prod", "production"].includes(ctx.environment.toLowerCase())) {
            const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
                placeHolder: "You are pushing to PRODUCTION. Are you sure?",
            });
            if (confirm !== "Yes") {
                vscode.window.showInformationMessage("Push cancelled");
                return;
            }
        }
        progress.report({ message: "Uploading to NetSuite..." });
        const fileContent = ctx.editor?.document.getText() ?? "";
        const encoded = Buffer.from(fileContent, "utf8").toString("base64");
        const responseData = await (0, Request_1.request)(ctx.auth, "POST", {
            fileName: ctx.fileName,
            message: encoded,
        });
        progress.report({ message: "Creating local backup..." });
        if (responseData.oldContent) {
            await Utils_1.default.saveBackup(ctx, responseData.oldContent);
        }
        await this.cache.invalidate({
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
            fileName: ctx.fileName,
        });
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder && ctx.filePath) {
            const relativePath = vscode.workspace.asRelativePath(ctx.filePath, false);
            const key = `ssm:lastPush:${ctx.environment}:${relativePath}`;
            await this.extensionContext.globalState.update(key, {
                ts: Date.now(),
            });
        }
        vscode.window.showInformationMessage(responseData.message ?? "Success");
    }
    async handleCompareCode(progress) {
        progress.report({ message: "Fetching file from NetSuite..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)();
        const responseData = await (0, Request_1.request)(ctx.auth, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });
        const decoded = Buffer.from(responseData.contents, "base64").toString("utf8");
        await vscode.commands.executeCommand("vscode.diff", vscode.Uri.file(ctx.filePath), await Utils_1.default.createVirtualDocument(decoded), `Local -> Netsuite (${ctx.fileName}) || ${ctx.environment}`);
        vscode.window.showInformationMessage("Success");
    }
    async handleGetSearchList(progress) {
        progress.report({ message: "Fetching search list from NetSuite..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)(false);
        const listScope = this.getCacheScope(ctx, "getSearchList");
        const responseData = await this.cache.getOrSet(listScope, this.cacheTtlMs.getSearchList, () => (0, Request_1.request)(ctx.auth, "GET", { action: "getSearchList" }));
        const selectedSearch = await vscode.window.showQuickPick(responseData.list.map((search) => ({
            label: search.title,
            description: search.recordType,
            id: search.id,
        })), { placeHolder: "Select Search" });
        if (!selectedSearch) {
            vscode.window.showErrorMessage("No search selected");
            return;
        }
        const search = responseData.list.find((item) => item.id === selectedSearch.id);
        if (!search) {
            vscode.window.showErrorMessage("Unable to resolve selected search");
            return;
        }
        progress.report({ message: "Fetching preview data from NetSuite..." });
        await this.sleep(100);
        const previewScope = this.getCacheScope(ctx, "previewSearch", {
            searchId: search.id,
        });
        const previewResponse = await this.cache.getOrSet(previewScope, this.cacheTtlMs.previewSearch, () => (0, Request_1.request)(ctx.auth, "GET", {
            searchId: search.id,
            action: "previewSearch",
        }));
        const panel = vscode.window.createWebviewPanel("netsuiteSearchPreview", `Saved Search Preview - ${selectedSearch.label}`, vscode.ViewColumn.One, { enableScripts: true });
        const boilerplate = Utils_1.default.createBoilerplate(previewResponse);
        panel.webview.html = Utils_1.default.renderTable(previewResponse, boilerplate);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === "copyBoilerplate" && message.boilerplate) {
                await vscode.env.clipboard.writeText(message.boilerplate);
                vscode.window.showInformationMessage("Search boilerplate copied");
            }
        });
    }
    async handlePullFromProduction(progress) {
        progress.report({ message: "Fetching file from NetSuite production..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)(true, true);
        await this.replaceActiveEditorContents(ctx);
        vscode.window.showInformationMessage("Success");
    }
    async handlePullFromCurrentEnvironment(progress) {
        progress.report({ message: "Fetching file from NetSuite..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)();
        await this.replaceActiveEditorContents(ctx);
        vscode.window.showInformationMessage("Success");
    }
    async handleOpenInNetSuite(progress) {
        progress.report({ message: "Fetching script ID from NetSuite..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)();
        const scriptScope = this.getCacheScope(ctx, "getScriptId", {
            fileName: ctx.fileName,
        });
        const responseData = await this.cache.getOrSet(scriptScope, this.cacheTtlMs.getScriptId, () => (0, Request_1.request)(ctx.auth, "GET", {
            fileName: ctx.fileName,
            action: "getScriptId",
        }));
        const accountId = responseData.accountId.toLowerCase().replace("_", "-");
        const fileUrl = `https://${accountId}.app.netsuite.com/app/common/media/mediaitem.nl?id=${responseData.scriptId}`;
        const scriptUrl = `https://${accountId}.app.netsuite.com/app/common/scripting/script.nl?id=${responseData.scriptId}`;
        const netSuiteUrl = responseData.type === "file" ? fileUrl : scriptUrl;
        await vscode.env.openExternal(vscode.Uri.parse(netSuiteUrl));
    }
    async handleFetchRecentLogs(progress) {
        progress.report({ message: "Fetching recent logs from NetSuite..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)();
        const responseData = await (0, Request_1.request)(ctx.auth, "GET", {
            fileName: ctx.fileName,
            action: "fetchRecentLogs",
        });
        Utils_1.default.getLogPanel(this.extensionContext).webview.postMessage({
            type: "logs",
            payload: Utils_1.default.formatLogs(responseData.logs),
        });
    }
    async handleRefreshSearchCache(progress) {
        progress.report({ message: "Refreshing search cache..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)(false);
        const invalidatedCount = await this.cache.invalidate({
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
            action: "getSearchList",
        });
        const scope = this.getCacheScope(ctx, "getSearchList");
        await this.cache.getOrSet(scope, this.cacheTtlMs.getSearchList, () => (0, Request_1.request)(ctx.auth, "GET", { action: "getSearchList" }));
        vscode.window.showInformationMessage(`Search cache refreshed (${invalidatedCount} entries removed).`);
    }
    async handleClearCacheCurrentScope(progress) {
        progress.report({ message: "Clearing cache for current account/environment..." });
        await this.sleep(100);
        const ctx = await (0, Context_1.getContext)(false);
        const deleted = await this.cache.invalidate({
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
        });
        vscode.window.showInformationMessage(`Cleared ${deleted} cached entr${deleted === 1 ? "y" : "ies"} for ${ctx.environment}.`);
    }
    async handleClearCacheAll(progress) {
        progress.report({ message: "Clearing all SuiteScript Manager cache..." });
        await this.sleep(100);
        const deleted = await this.cache.invalidate({});
        vscode.window.showInformationMessage(`Cleared ${deleted} cached entr${deleted === 1 ? "y" : "ies"} in total.`);
    }
    async handleConfigureEnvironment(progress) {
        progress.report({ message: "Reading workspace folders..." });
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error("No workspace folder open");
        }
        const excluded = new Set(["node_modules", "Backup", ".git", ".vscode", ".idea"]);
        const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
        const envFolders = entries
            .filter(([name, type]) => type === vscode.FileType.Directory &&
            !name.startsWith(".") &&
            !excluded.has(name))
            .map(([name]) => name);
        const customLabel = "$(edit) Enter a custom name...";
        const pickItems = [
            ...envFolders.map((folderName) => ({ label: folderName })),
            { label: customLabel, alwaysShow: true },
        ];
        const picked = await vscode.window.showQuickPick(pickItems, {
            placeHolder: "Select an environment folder to configure",
            ignoreFocusOut: true,
        });
        if (!picked) {
            return;
        }
        const environment = picked.label === customLabel
            ? await vscode.window.showInputBox({
                title: "Configure Environment",
                prompt: "Environment name",
                placeHolder: "e.g. sandbox, production",
                ignoreFocusOut: true,
                validateInput: (value) => value.trim() ? null : "Name cannot be empty",
            })
            : picked.label;
        if (!environment) {
            return;
        }
        const configPath = path.join(workspaceFolder.uri.fsPath, ".ss-manager.json");
        let config = {};
        try {
            const raw = await fs.promises.readFile(configPath, "utf-8");
            config = JSON.parse(raw);
        }
        catch {
            config = {};
        }
        const existing = config[environment] ?? {};
        const isUpdate = Boolean(config[environment]);
        const fields = [
            { key: "CLIENT_ID", label: "Client ID", placeholder: "your-client-id", password: false },
            { key: "CLIENT_SECRET", label: "Client Secret", placeholder: "your-client-secret", password: true },
            { key: "ACCESS_TOKEN", label: "Access Token", placeholder: "your-access-token", password: false },
            { key: "ACCESS_SECRET", label: "Access Secret", placeholder: "your-access-secret", password: true },
            { key: "REALM", label: "Realm", placeholder: "1234567_SB1", password: false },
            {
                key: "URL",
                label: "RESTlet URL",
                placeholder: "https://<account>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=###&deploy=#",
                password: false,
            },
        ];
        const newValues = {};
        for (const field of fields) {
            const value = await vscode.window.showInputBox({
                title: `Configure "${environment}" - ${field.label}`,
                prompt: field.label,
                value: existing[field.key] ?? "",
                placeHolder: field.placeholder,
                password: field.password,
                ignoreFocusOut: true,
                validateInput: (input) => input.trim() ? null : `${field.label} is required`,
            });
            if (value === undefined) {
                vscode.window.showInformationMessage("Configuration cancelled");
                return;
            }
            newValues[field.key] = value;
        }
        config[environment] = newValues;
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        vscode.window.showInformationMessage(`${isUpdate ? "Updated" : "Created"} configuration for "${environment}".`);
    }
    async replaceActiveEditorContents(ctx) {
        const responseData = await (0, Request_1.request)(ctx.auth, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });
        const decoded = Buffer.from(responseData.contents, "base64").toString("utf8");
        const document = ctx.editor?.document;
        if (!document) {
            throw new Error("No active editor found");
        }
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(document.uri, fullRange, decoded);
        await vscode.workspace.applyEdit(workspaceEdit);
    }
    getCacheScope(ctx, action, overrides = {}) {
        return {
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
            action,
            fileName: overrides.fileName ?? ctx.fileName ?? "",
            searchId: overrides.searchId ?? "",
        };
    }
    getAccountKey(ctx) {
        const envConfig = ctx.config[ctx.environment];
        return envConfig.REALM || envConfig.URL || "default";
    }
    getWorkspaceKey() {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    }
    async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
    getErrorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
exports.default = CommandHandler;
//# sourceMappingURL=Handler.js.map