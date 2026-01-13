// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const path = require("path");
const CommandHandler = require("./Handler");
const handler = new CommandHandler();
let folderStatusBarItem = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Create the status bar item
    folderStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 
        100
    );
    
    // Add to subscriptions so it's disposed of properly
    context.subscriptions.push(folderStatusBarItem);

	// Listen for editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
    );

    // Initial update
    updateStatusBar(vscode.window.activeTextEditor);

	const commands = [
		{ id: 'suitescript-manager.push-code', handler: () => handler.runTask((progress) => handler.handlePushCode(progress))},
		{ id: 'suitescript-manager.compare-code', handler: () => handler.runTask((progress) => handler.handleCompareCode(progress))},
		{ id: 'suitescript-manager.get-search-list', handler: () => handler.runTask((progress) => handler.handleGetSearchList(progress))},
		{ id: 'suitescript-manager.pull-from-production', handler: () => handler.runTask((progress) => handler.handlePullFromProduction(progress))},
		{ id: 'suitescript-manager.pull-from-current-environment', handler: () => handler.runTask((progress) => handler.handlePullFromCurrentEnvironment(progress))},
		{ id: 'suitescript-manager.open-in-netsuite', handler: () => handler.runTask((progress) => handler.handleOpenInNetSuite(progress))},
		{ id: 'suitescript-manager.fetch-recent-logs', handler: () => handler.runTask((progress) => handler.handleFetchRecentLogs(progress))},
		// { id: 'suitescript-manager.check-environment', handler: handleCheckEnvironment},
	]

	commands.forEach((command) => {
		context.subscriptions.push(
			vscode.commands.registerCommand(command.id, command.handler)
		);
	});

	
}
	const updateStatusBar = (editor) => {
        if (editor) {
            const uri = editor.document.uri;
			console.log('uri',uri)
			let separatedURI = editor.document.uri.fsPath.split(path.sep)
			console.log('separatedURI',separatedURI)
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
			console.log('workspaceFolder',workspaceFolder);

            if (workspaceFolder) {
                const folderIndex = separatedURI.indexOf(workspaceFolder.name) + 1;
				console.log('folderIndex',folderIndex);
                const folderName = workspaceFolder.name;
				console.log('folderName',folderName);

                // Set the text
                folderStatusBarItem.text = `${folderName}: ${separatedURI[folderIndex]}`;
                
                // Change color based on the index (example logic)
                if (separatedURI[folderIndex].toLocaleLowerCase() == 'prod' || separatedURI[folderIndex].toLocaleLowerCase() == 'production') {
                    folderStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                } else {
                    folderStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                }

                folderStatusBarItem.show();
            } else {
                folderStatusBarItem.hide();
            }
        } else {
            folderStatusBarItem.hide();
        }
    };


// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
