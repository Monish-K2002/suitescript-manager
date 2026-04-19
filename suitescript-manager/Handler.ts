import * as fs from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

import CacheService from "./CacheService";
import { getContext } from "./Context";
import { request } from "./Request";
import utils from "./Util/Utils";
import type {
    CacheScope,
    ExtensionContextData,
    FetchRecentLogsResponse,
    PreviewSearchResponse,
    SearchListItem,
} from "./types";

interface BaseResponse {
    status?: string;
    message?: string;
}

interface PushResponse extends BaseResponse {
    oldContent?: string;
}

interface ContentResponse extends BaseResponse {
    contents: string;
}

interface SearchListResponse extends BaseResponse {
    list: SearchListItem[];
}

interface ScriptIdResponse extends BaseResponse {
    scriptId: string;
    accountId: string;
    type: "file" | "script";
}

interface EnvironmentField {
    key: "CLIENT_ID" | "CLIENT_SECRET" | "ACCESS_TOKEN" | "ACCESS_SECRET" | "REALM" | "URL";
    label: string;
    placeholder: string;
    password: boolean;
}

class CommandHandler {
    private readonly extensionContext: vscode.ExtensionContext;

    private readonly cache: CacheService;

    private readonly cacheTtlMs = {
        getSearchList: 6 * 60 * 60 * 1000,
        previewSearch: 15 * 60 * 1000,
        getScriptId: 30 * 24 * 60 * 60 * 1000,
    };

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext;
        this.cache = new CacheService(extensionContext.globalState);
    }

    public async runTask(
        task: (progress: vscode.Progress<{ message?: string }>) => Promise<void>,
    ): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "SuiteScript Manager",
                cancellable: false,
            },
            async (progress) => {
                try {
                    await task(progress);
                } catch (error) {
                    vscode.window.showErrorMessage(`Operation failed: ${this.getErrorMessage(error)}`);
                    console.error(error);
                }
            },
        );
    }

    public async handlePushCode(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Preparing context..." });
        const ctx = await getContext();

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

        const responseData = await request<PushResponse>(ctx.auth!, "POST", {
            fileName: ctx.fileName,
            message: encoded,
        });

        progress.report({ message: "Creating local backup..." });
        if (responseData.oldContent) {
            await utils.saveBackup(ctx, responseData.oldContent);
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

    public async handleCompareCode(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Fetching file from NetSuite..." });
        await this.sleep(100);

        const ctx = await getContext();
        const responseData = await request<ContentResponse>(ctx.auth!, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });

        const decoded = Buffer.from(responseData.contents, "base64").toString("utf8");
        await vscode.commands.executeCommand(
            "vscode.diff",
            vscode.Uri.file(ctx.filePath!),
            await utils.createVirtualDocument(decoded),
            `Local -> Netsuite (${ctx.fileName}) || ${ctx.environment}`,
        );

        vscode.window.showInformationMessage("Success");
    }

    public async handleGetSearchList(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Fetching search list from NetSuite..." });
        await this.sleep(100);

        const ctx = await getContext(false);
        const listScope = this.getCacheScope(ctx, "getSearchList");
        const responseData = await this.cache.getOrSet(
            listScope,
            this.cacheTtlMs.getSearchList,
            () => request<SearchListResponse>(ctx.auth!, "GET", { action: "getSearchList" }),
        );

        const selectedSearch = await vscode.window.showQuickPick(
            responseData.list.map((search) => ({
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
        const previewResponse = await this.cache.getOrSet(
            previewScope,
            this.cacheTtlMs.previewSearch,
            () => request<PreviewSearchResponse>(ctx.auth!, "GET", {
                searchId: search.id,
                action: "previewSearch",
            }),
        );

        const panel = vscode.window.createWebviewPanel(
            "netsuiteSearchPreview",
            `Saved Search Preview - ${selectedSearch.label}`,
            vscode.ViewColumn.One,
            { enableScripts: true },
        );

        const boilerplate = utils.createBoilerplate(previewResponse);
        panel.webview.html = utils.renderTable(previewResponse, boilerplate);

        panel.webview.onDidReceiveMessage(async (message: { command?: string; boilerplate?: string }) => {
            if (message.command === "copyBoilerplate" && message.boilerplate) {
                await vscode.env.clipboard.writeText(message.boilerplate);
                vscode.window.showInformationMessage("Search boilerplate copied");
            }
        });
    }

    public async handlePullFromProduction(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Fetching file from NetSuite production..." });
        await this.sleep(100);

        const ctx = await getContext(true, true);
        await this.replaceActiveEditorContents(ctx);
        vscode.window.showInformationMessage("Success");
    }

    public async handlePullFromCurrentEnvironment(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Fetching file from NetSuite..." });
        await this.sleep(100);

        const ctx = await getContext();
        await this.replaceActiveEditorContents(ctx);
        vscode.window.showInformationMessage("Success");
    }

    public async handleOpenInNetSuite(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Fetching script ID from NetSuite..." });
        await this.sleep(100);

        const ctx = await getContext();
        const scriptScope = this.getCacheScope(ctx, "getScriptId", {
            fileName: ctx.fileName,
        });

        const responseData = await this.cache.getOrSet(
            scriptScope,
            this.cacheTtlMs.getScriptId,
            () => request<ScriptIdResponse>(ctx.auth!, "GET", {
                fileName: ctx.fileName,
                action: "getScriptId",
            }),
        );

        const accountId = responseData.accountId.toLowerCase().replace("_", "-");
        const fileUrl = `https://${accountId}.app.netsuite.com/app/common/media/mediaitem.nl?id=${responseData.scriptId}`;
        const scriptUrl = `https://${accountId}.app.netsuite.com/app/common/scripting/script.nl?id=${responseData.scriptId}`;
        const netSuiteUrl = responseData.type === "file" ? fileUrl : scriptUrl;

        await vscode.env.openExternal(vscode.Uri.parse(netSuiteUrl));
    }

    public async handleFetchRecentLogs(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Fetching recent logs from NetSuite..." });
        await this.sleep(100);

        const ctx = await getContext();
        const responseData = await request<FetchRecentLogsResponse>(ctx.auth!, "GET", {
            fileName: ctx.fileName,
            action: "fetchRecentLogs",
        });

        utils.getLogPanel(this.extensionContext).webview.postMessage({
            type: "logs",
            payload: utils.formatLogs(responseData.logs),
        });
    }

    public async handleRefreshSearchCache(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Refreshing search cache..." });
        await this.sleep(100);

        const ctx = await getContext(false);
        const invalidatedCount = await this.cache.invalidate({
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
            action: "getSearchList",
        });

        const scope = this.getCacheScope(ctx, "getSearchList");
        await this.cache.getOrSet(
            scope,
            this.cacheTtlMs.getSearchList,
            () => request<SearchListResponse>(ctx.auth!, "GET", { action: "getSearchList" }),
        );

        vscode.window.showInformationMessage(
            `Search cache refreshed (${invalidatedCount} entries removed).`,
        );
    }

    public async handleClearCacheCurrentScope(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Clearing cache for current account/environment..." });
        await this.sleep(100);

        const ctx = await getContext(false);
        const deleted = await this.cache.invalidate({
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
        });

        vscode.window.showInformationMessage(
            `Cleared ${deleted} cached entr${deleted === 1 ? "y" : "ies"} for ${ctx.environment}.`,
        );
    }

    public async handleClearCacheAll(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Clearing all SuiteScript Manager cache..." });
        await this.sleep(100);

        const deleted = await this.cache.invalidate({});
        vscode.window.showInformationMessage(
            `Cleared ${deleted} cached entr${deleted === 1 ? "y" : "ies"} in total.`,
        );
    }

    public async handleConfigureEnvironment(progress: vscode.Progress<{ message?: string }>): Promise<void> {
        progress.report({ message: "Reading workspace folders..." });

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error("No workspace folder open");
        }

        const excluded = new Set(["node_modules", "Backup", ".git", ".vscode", ".idea"]);
        const entries = await vscode.workspace.fs.readDirectory(workspaceFolder.uri);
        const envFolders = entries
            .filter(([name, type]) =>
                type === vscode.FileType.Directory &&
                !name.startsWith(".") &&
                !excluded.has(name),
            )
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
        let config: Record<string, Record<string, string>> = {};

        try {
            const raw = await fs.promises.readFile(configPath, "utf-8");
            config = JSON.parse(raw) as Record<string, Record<string, string>>;
        } catch {
            config = {};
        }

        const existing = config[environment] ?? {};
        const isUpdate = Boolean(config[environment]);
        const fields: EnvironmentField[] = [
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

        const newValues: Record<string, string> = {};
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

        vscode.window.showInformationMessage(
            `${isUpdate ? "Updated" : "Created"} configuration for "${environment}".`,
        );
    }

    private async replaceActiveEditorContents(ctx: ExtensionContextData): Promise<void> {
        const responseData = await request<ContentResponse>(ctx.auth!, "GET", {
            fileName: ctx.fileName,
            action: "getScriptContents",
        });

        const decoded = Buffer.from(responseData.contents, "base64").toString("utf8");
        const document = ctx.editor?.document;
        if (!document) {
            throw new Error("No active editor found");
        }

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
        );

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(document.uri, fullRange, decoded);
        await vscode.workspace.applyEdit(workspaceEdit);
    }

    private getCacheScope(
        ctx: ExtensionContextData,
        action: string,
        overrides: CacheScope = {},
    ): CacheScope {
        return {
            accountKey: this.getAccountKey(ctx),
            environment: ctx.environment,
            workspaceKey: this.getWorkspaceKey(),
            action,
            fileName: overrides.fileName ?? ctx.fileName ?? "",
            searchId: overrides.searchId ?? "",
        };
    }

    private getAccountKey(ctx: ExtensionContextData): string {
        const envConfig = ctx.config[ctx.environment];
        return envConfig.REALM || envConfig.URL || "default";
    }

    private getWorkspaceKey(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}

export default CommandHandler;
