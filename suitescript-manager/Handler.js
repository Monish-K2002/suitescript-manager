const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { getContext } = require("./Context");
const { request } = require("./Request");
const utils = require("./Util/Utils");
const CacheService = require("./CacheService");

class CommandHandler {
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        this.cache = new CacheService(extensionContext.globalState);
        this.cacheTtlMs = {
            getSearchList: 6 * 60 * 60 * 1000,
            previewSearch: 15 * 60 * 1000,
            getScriptId: 24 * 60 * 60 * 1000,
        };
    }

    /**
     * Optimized Wrapper
     * @param {Function} task - The logic to execute
     */
    async runTask(task) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "SuiteScript Manager",
            cancellable: false,
        }, async (progress) => {
            try {
                await task(progress);
            } catch (error) {
                vscode.window.showErrorMessage(`Operation failed: ${error.message}`);
                console.error(error);
            }
        });
    }

    async handlePushCode(progress) {
        progress.report({ message: "Preparing context..." });
        const ctx = await getContext();

        const isProduction = ["prod", "production"].includes(ctx.environment.toLowerCase());
        if (isProduction) {
            const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
                placeHolder: "You are pushing to PRODUCTION. Are you sure?",
            });
            if (confirm !== "Yes") {
                vscode.window.showInformationMessage("Push cancelled");
                return;
            }
        }

        progress.report({ message: "Uploading to NetSuite..." });
        const fileContent = ctx.editor.document.getText();
        const encoded = Buffer.from(fileContent, "utf8").toString("base64");

        const responseData = await request(ctx.auth, "POST", {
            fileName: ctx.fileName,
            message: encoded,
        });

        progress.report({ message: "Creating local backup..." });
        if (responseData.oldContent) {
            await utils.saveBackup(ctx, responseData.oldContent);
        }

        await this.cache.invalidate({
            accountKey: this.#getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.#getWorkspaceKey(),
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

        vscode.window.showInformationMessage(responseData?.message || "Success");
    }

    async handleCompareCode(progress) {
        progress.report({ message: "Fetching File From NetSuite..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext();

        const authData = ctx.auth;
        const responseData = await request(authData, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });

        const decoded = Buffer.from(responseData.contents, "base64").toString("utf8");

        vscode.commands.executeCommand(
            "vscode.diff",
            vscode.Uri.file(ctx.filePath),
            await utils.createVirtualDocument(decoded),
            `Local -> Netsuite (${ctx.fileName}) || ${ctx.environment}`,
        );

        vscode.window.showInformationMessage("success");
    }

    async handleGetSearchList(progress) {
        progress.report({ message: "Fetching Search List From NetSuite..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext(false);

        const authData = ctx.auth;
        const listScope = this.#getCacheScope(ctx, "getSearchList");
        const responseData = await this.cache.getOrSet(
            listScope,
            this.cacheTtlMs.getSearchList,
            () => request(authData, "GET", { action: "getSearchList" }),
        );

        vscode.window.showInformationMessage("List Retrieved");

        const searchList = responseData.list;

        /**
         * @type {Object}
         */
        const selectedSearch = await vscode.window.showQuickPick(
            searchList.map((search) => ({
                label: search.title,
                description: search.recordType,
                id: search.id,
            })),
            { placeHolder: "Select Search" },
        );

        if (!selectedSearch) {
            vscode.window.showErrorMessage("No search selected");
            return;
        }

        const searchObj = searchList.find((search) => search.id === selectedSearch.id);
        if (!searchObj) {
            vscode.window.showErrorMessage("Unable to resolve selected search");
            return;
        }

        progress.report({ message: "Fetching Preview Data from NetSuite..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const previewScope = this.#getCacheScope(ctx, "previewSearch", {
            searchId: searchObj.id,
        });

        const searchResponseData = await this.cache.getOrSet(
            previewScope,
            this.cacheTtlMs.previewSearch,
            () => request(authData, "GET", {
                searchId: searchObj.id,
                action: "previewSearch",
            }),
        );

        const panel = vscode.window.createWebviewPanel(
            "netsuiteSearchPreview",
            `Saved Search Preview - ${selectedSearch.label}`,
            vscode.ViewColumn.One,
            { enableScripts: true },
        );

        const boilerplate = utils.createBoilerplate(searchResponseData);

        panel.webview.html = utils.renderTable(
            searchResponseData,
            boilerplate,
        );

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === "copyBoilerplate") {
                await vscode.env.clipboard.writeText(message.boilerplate);
                vscode.window.showInformationMessage("Search boilerplate copied");
            }
        });
    }

    async handlePullFromProduction(progress) {
        progress.report({ message: "Fetching file from NetSuite Production..." });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const ctx = await getContext(true, true);

        const authData = ctx.auth;
        const responseData = await request(authData, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });

        const decoded = Buffer.from(
            responseData.contents,
            "base64",
        ).toString("utf8");

        const fullRange = new vscode.Range(
            ctx.editor.document.positionAt(0),
            ctx.editor.document.positionAt(ctx.editor.document.getText().length),
        );

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(
            ctx.editor.document.uri,
            fullRange,
            decoded,
        );

        await vscode.workspace.applyEdit(workspaceEdit);

        vscode.window.showInformationMessage("success");
    }

    async handlePullFromCurrentEnvironment(progress) {
        progress.report({ message: "Fetching file from NetSuite..." });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const ctx = await getContext();

        const authData = ctx.auth;
        const responseData = await request(authData, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });

        const decoded = Buffer.from(
            responseData.contents,
            "base64",
        ).toString("utf8");

        const fullRange = new vscode.Range(
            ctx.editor.document.positionAt(0),
            ctx.editor.document.positionAt(
                ctx.editor.document.getText().length,
            ),
        );

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(
            ctx.editor.document.uri,
            fullRange,
            decoded,
        );

        await vscode.workspace.applyEdit(workspaceEdit);

        vscode.window.showInformationMessage("success");
    }

    async handleOpenInNetSuite(progress) {
        progress.report({ message: "Fetching Script ID from NetSuite..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext();
        const authData = ctx.auth;

        const scriptScope = this.#getCacheScope(ctx, "getScriptId", {
            fileName: ctx.fileName,
        });

        const responseData = await this.cache.getOrSet(
            scriptScope,
            this.cacheTtlMs.getScriptId,
            () => request(authData, "GET", {
                fileName: ctx.fileName,
                action: "getScriptId",
            }),
        );

        const scriptId = responseData.scriptId;

        const accountId = responseData.accountId.toLowerCase().replace("_","-");
        const fileUrl = `https://${accountId}.app.netsuite.com/app/common/media/mediaitem.nl?id=${scriptId}`;
        const scriptUrl = `https://${accountId}.app.netsuite.com/app/common/scripting/script.nl?id=${scriptId}`;
        const nsUrl = responseData.type === "file" ? fileUrl : scriptUrl;
        vscode.env.openExternal(vscode.Uri.parse(nsUrl));
    }

    async handleFetchRecentLogs(progress) {
        progress.report({ message: "Fetching Recent Logs from NetSuite..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext();
        const authData = ctx.auth;

        const responseData = await request(authData, "GET", {
            fileName: ctx.fileName,
            action: "fetchRecentLogs",
        });

        utils.getLogPanel(this.extensionContext);

        const logData = responseData.logs;
        const logs = utils.formatLogs(logData);

        utils.logPanel?.webview.postMessage({
            type: "logs",
            payload: logs,
        });
    }

    async handleRefreshSearchCache(progress) {
        progress.report({ message: "Refreshing search cache..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext(false);
        const authData = ctx.auth;

        const invalidatedCount = await this.cache.invalidate({
            accountKey: this.#getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.#getWorkspaceKey(),
            action: "getSearchList",
        });

        const scope = this.#getCacheScope(ctx, "getSearchList");
        await this.cache.getOrSet(
            scope,
            this.cacheTtlMs.getSearchList,
            () => request(authData, "GET", { action: "getSearchList" }),
        );

        vscode.window.showInformationMessage(
            `Search cache refreshed (${invalidatedCount} entries removed).`,
        );
    }

    async handleClearCacheCurrentScope(progress) {
        progress.report({ message: "Clearing cache for current account/environment..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext(false);
        const deleted = await this.cache.invalidate({
            accountKey: this.#getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.#getWorkspaceKey(),
        });

        vscode.window.showInformationMessage(
            `Cleared ${deleted} cached entr${deleted === 1 ? "y" : "ies"} for ${ctx.environment}.`,
        );
    }

    async handleClearCacheAll(progress) {
        progress.report({ message: "Clearing all SuiteScript Manager cache..." });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const deleted = await this.cache.invalidate({});
        vscode.window.showInformationMessage(
            `Cleared ${deleted} cached entr${deleted === 1 ? "y" : "ies"} in total.`,
        );
    }

    async handleConfigureEnvironment(progress) {
        progress.report({ message: "Reading workspace folders..." });

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error("No workspace folder open");
        }

        const EXCLUDED = new Set(["node_modules", "Backup", ".git", ".vscode", ".idea"]);
        const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
        const envFolders = entries
            .filter(([name, type]) =>
                type === vscode.FileType.Directory &&
                !name.startsWith(".") &&
                !EXCLUDED.has(name),
            )
            .map(([name]) => name);

        const CUSTOM_LABEL = "$(edit) Enter a custom name...";
        const pickItems = [
            ...envFolders.map((f) => ({ label: f })),
            { label: CUSTOM_LABEL, alwaysShow: true },
        ];

        const picked = await vscode.window.showQuickPick(pickItems, {
            placeHolder: "Select an environment folder to configure",
            ignoreFocusOut: true,
        });
        if (!picked) return;

        let environment;
        if (picked.label === CUSTOM_LABEL) {
            environment = await vscode.window.showInputBox({
                title: "Configure Environment",
                prompt: "Environment name",
                placeHolder: "e.g. sandbox, production",
                ignoreFocusOut: true,
                validateInput: (v) => (v ?? "").trim() ? null : "Name cannot be empty",
            });
        } else {
            environment = picked.label;
        }
        if (!environment) return;

        const configPath = path.join(workspaceFolder.uri.fsPath, ".ss-manager.json");
        let config = {};
        try {
            const raw = await fs.promises.readFile(configPath, "utf-8");
            config = JSON.parse(raw);
        } catch {
            // File does not exist or is not valid JSON — start fresh
        }

        const existing = config[environment] || {};
        const isUpdate = Boolean(config[environment]);

        const fields = [
            { key: "CLIENT_ID",     label: "Client ID",     placeholder: "your-client-id",     password: false },
            { key: "CLIENT_SECRET", label: "Client Secret", placeholder: "your-client-secret", password: true  },
            { key: "ACCESS_TOKEN",  label: "Access Token",  placeholder: "your-access-token",  password: false },
            { key: "ACCESS_SECRET", label: "Access Secret", placeholder: "your-access-secret", password: true  },
            { key: "REALM",         label: "Realm",         placeholder: "1234567_SB1",         password: false },
            { key: "URL",           label: "RESTlet URL",   placeholder: "https://<account>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=###&deploy=#", password: false },
        ];

        const newValues = {};
        for (const field of fields) {
            const value = await vscode.window.showInputBox({
                title: `Configure "${environment}" — ${field.label}`,
                prompt: field.label,
                value: existing[field.key] ?? "",
                placeHolder: field.placeholder,
                password: field.password,
                ignoreFocusOut: true,
                validateInput: (v) => (v ?? "").trim() ? null : `${field.label} is required`,
            });

            if (value === undefined) {
                vscode.window.showInformationMessage("Configuration cancelled");
                return;
            }
            newValues[field.key] = value;
        }

        config[environment] = newValues;
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

        vscode.window.showInformationMessage(
            `${isUpdate ? "Updated" : "Created"} configuration for "${environment}".`,
        );
    }

    #getCacheScope(ctx, action, overrides = {}) {
        return {
            accountKey: this.#getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.#getWorkspaceKey(),
            action,
            fileName: overrides.fileName || ctx.fileName || "",
            searchId: overrides.searchId || "",
        };
    }

    #getAccountKey(ctx) {
        const envConfig = ctx.config?.[ctx.environment] || {};
        return envConfig.REALM || envConfig.URL || "default";
    }

    #getWorkspaceKey() {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    }
}

module.exports = CommandHandler;
