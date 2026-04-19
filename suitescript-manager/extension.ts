import * as path from "node:path";

import * as vscode from "vscode";

import CommandHandler from "./Handler";

let folderStatusBarItem: vscode.StatusBarItem | undefined;
let handler: CommandHandler | undefined;

// Bootstraps the extension UI and wires every contributed command to the shared handler.
export function activate(context: vscode.ExtensionContext): void {
    handler = new CommandHandler(context);

    folderStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100,
    );
    context.subscriptions.push(folderStatusBarItem);
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
    );

    updateStatusBar(vscode.window.activeTextEditor);

    const commands: Array<{ id: string; handler: () => Promise<void> }> = [
        { id: "suitescript-manager.push-code", handler: () => handler!.runTask((progress) => handler!.handlePushCode(progress)) },
        { id: "suitescript-manager.compare-code", handler: () => handler!.runTask((progress) => handler!.handleCompareCode(progress)) },
        { id: "suitescript-manager.get-search-list", handler: () => handler!.runTask((progress) => handler!.handleGetSearchList(progress)) },
        { id: "suitescript-manager.pull-from-production", handler: () => handler!.runTask((progress) => handler!.handlePullFromProduction(progress)) },
        { id: "suitescript-manager.pull-from-current-environment", handler: () => handler!.runTask((progress) => handler!.handlePullFromCurrentEnvironment(progress)) },
        { id: "suitescript-manager.open-in-netsuite", handler: () => handler!.runTask((progress) => handler!.handleOpenInNetSuite(progress)) },
        { id: "suitescript-manager.fetch-recent-logs", handler: () => handler!.runTask((progress) => handler!.handleFetchRecentLogs(progress)) },
        { id: "suitescript-manager.refresh-search-cache", handler: () => handler!.runTask((progress) => handler!.handleRefreshSearchCache(progress)) },
        { id: "suitescript-manager.clear-cache-current-scope", handler: () => handler!.runTask((progress) => handler!.handleClearCacheCurrentScope(progress)) },
        { id: "suitescript-manager.clear-cache-all", handler: () => handler!.runTask((progress) => handler!.handleClearCacheAll(progress)) },
        { id: "suitescript-manager.configure-environment", handler: () => handler!.runTask((progress) => handler!.handleConfigureEnvironment(progress)) },
    ];

    commands.forEach((command) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(command.id, command.handler),
        );
    });
}

// Derives the environment from the active file path and mirrors it in the status bar.
function updateStatusBar(editor?: vscode.TextEditor): void {
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
    folderStatusBarItem.backgroundColor = new vscode.ThemeColor(
        ["prod", "production"].includes(environment.toLowerCase())
            ? "statusBarItem.errorBackground"
            : "statusBarItem.warningBackground",
    );
    folderStatusBarItem.show();
}

export function deactivate(): void {}
