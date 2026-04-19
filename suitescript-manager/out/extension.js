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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const Handler_1 = __importDefault(require("./Handler"));
const SyncStatusProvider_1 = __importDefault(require("./SyncStatusProvider"));
let folderStatusBarItem;
let handler;
function activate(context) {
    handler = new Handler_1.default(context);
    const syncStatusProvider = new SyncStatusProvider_1.default(context);
    const syncTreeView = vscode.window.createTreeView("suitescript-manager.syncStatus", { treeDataProvider: syncStatusProvider });
    context.subscriptions.push(syncTreeView);
    folderStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(folderStatusBarItem);
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));
    updateStatusBar(vscode.window.activeTextEditor);
    const commands = [
        { id: "suitescript-manager.push-code", handler: () => handler.runTask((progress) => handler.handlePushCode(progress)) },
        { id: "suitescript-manager.compare-code", handler: () => handler.runTask((progress) => handler.handleCompareCode(progress)) },
        { id: "suitescript-manager.get-search-list", handler: () => handler.runTask((progress) => handler.handleGetSearchList(progress)) },
        { id: "suitescript-manager.pull-from-production", handler: () => handler.runTask((progress) => handler.handlePullFromProduction(progress)) },
        { id: "suitescript-manager.pull-from-current-environment", handler: () => handler.runTask((progress) => handler.handlePullFromCurrentEnvironment(progress)) },
        { id: "suitescript-manager.open-in-netsuite", handler: () => handler.runTask((progress) => handler.handleOpenInNetSuite(progress)) },
        { id: "suitescript-manager.fetch-recent-logs", handler: () => handler.runTask((progress) => handler.handleFetchRecentLogs(progress)) },
        { id: "suitescript-manager.refresh-search-cache", handler: () => handler.runTask((progress) => handler.handleRefreshSearchCache(progress)) },
        { id: "suitescript-manager.clear-cache-current-scope", handler: () => handler.runTask((progress) => handler.handleClearCacheCurrentScope(progress)) },
        { id: "suitescript-manager.clear-cache-all", handler: () => handler.runTask((progress) => handler.handleClearCacheAll(progress)) },
        { id: "suitescript-manager.configure-environment", handler: () => handler.runTask((progress) => handler.handleConfigureEnvironment(progress)) },
    ];
    commands.forEach((command) => {
        context.subscriptions.push(vscode.commands.registerCommand(command.id, command.handler));
    });
}
function updateStatusBar(editor) {
    if (!editor || !folderStatusBarItem) {
        folderStatusBarItem?.hide();
        return;
    }
    const uri = editor.document.uri;
    const separatedUri = uri.fsPath.split(path.sep);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        folderStatusBarItem.hide();
        return;
    }
    const folderIndex = separatedUri.indexOf(workspaceFolder.name) + 1;
    const environment = separatedUri[folderIndex] || "unknown";
    folderStatusBarItem.text = `${workspaceFolder.name}: ${environment}`;
    folderStatusBarItem.backgroundColor = new vscode.ThemeColor(["prod", "production"].includes(environment.toLowerCase())
        ? "statusBarItem.errorBackground"
        : "statusBarItem.warningBackground");
    folderStatusBarItem.show();
}
function deactivate() { }
//# sourceMappingURL=extension.js.map