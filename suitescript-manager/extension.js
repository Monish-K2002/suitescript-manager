const vscode = require("vscode");
const path = require("path");
const CommandHandler = require("./Handler");

let folderStatusBarItem = null;
let handler = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
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

    const commands = [
        {
            id: "suitescript-manager.push-code",
            handler: () => handler.runTask((progress) => handler.handlePushCode(progress)),
        },
        {
            id: "suitescript-manager.compare-code",
            handler: () => handler.runTask((progress) => handler.handleCompareCode(progress)),
        },
        {
            id: "suitescript-manager.get-search-list",
            handler: () => handler.runTask((progress) => handler.handleGetSearchList(progress)),
        },
        {
            id: "suitescript-manager.pull-from-production",
            handler: () => handler.runTask((progress) => handler.handlePullFromProduction(progress)),
        },
        {
            id: "suitescript-manager.pull-from-current-environment",
            handler: () => handler.runTask((progress) => handler.handlePullFromCurrentEnvironment(progress)),
        },
        {
            id: "suitescript-manager.open-in-netsuite",
            handler: () => handler.runTask((progress) => handler.handleOpenInNetSuite(progress)),
        },
        {
            id: "suitescript-manager.fetch-recent-logs",
            handler: () => handler.runTask((progress) => handler.handleFetchRecentLogs(progress)),
        },
        {
            id: "suitescript-manager.refresh-search-cache",
            handler: () => handler.runTask((progress) => handler.handleRefreshSearchCache(progress)),
        },
        {
            id: "suitescript-manager.clear-cache-current-scope",
            handler: () => handler.runTask((progress) => handler.handleClearCacheCurrentScope(progress)),
        },
        {
            id: "suitescript-manager.clear-cache-all",
            handler: () => handler.runTask((progress) => handler.handleClearCacheAll(progress)),
        },
    ];

    commands.forEach((command) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(command.id, command.handler),
        );
    });
}

const updateStatusBar = (editor) => {
    if (!editor) {
        folderStatusBarItem?.hide();
        return;
    }

    const uri = editor.document.uri;
    const separatedURI = editor.document.uri.fsPath.split(path.sep);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

    if (!workspaceFolder) {
        folderStatusBarItem?.hide();
        return;
    }

    const folderIndex = separatedURI.indexOf(workspaceFolder.name) + 1;
    const folderName = workspaceFolder.name;
    const environment = separatedURI[folderIndex] || "unknown";

    folderStatusBarItem.text = `${folderName}: ${environment}`;

    if (["prod", "production"].includes(environment.toLowerCase())) {
        folderStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else {
        folderStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }

    folderStatusBarItem.show();
};

function deactivate() {}

module.exports = {
    activate,
    deactivate,
};
