// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const fs = require("fs");
const {getContext} = require("./Context");
const {request} = require('./Request')
const path = require("path");
let folderStatusBarItem = null;
let logPanel = null;

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


	// netsuiteStatusBar = vscode.window.createStatusBarItem(
	// 	vscode.StatusBarAlignment.Right,
	// 	100 // priority, higher = more to the left
	// );

	// netsuiteStatusBar.text = "NetSuite: Initializing…";
	// netsuiteStatusBar.tooltip = "NetSuite Extension Status";
	// netsuiteStatusBar.command = "suitescript-manager.show-status";

	// netsuiteStatusBar.show();

	// context.subscriptions.push(netsuiteStatusBar);

	const PUSH_CODE = vscode.commands.registerCommand("suitescript-manager.push-code",async () => {
		try{

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				try {
					progress.report({ message: "Pushing to NetSuite..." });
					await new Promise((resolve) =>
						setTimeout(resolve, 100),
					);
	
					const ctx = await getContext();
					console.log("ctx", ctx);
					console.log("ctx.environment", ctx.environment);
	
					const fileContent = ctx.editor.document.getText();
					const encoded = Buffer.from(
						fileContent,
						"utf8",
					).toString("base64");
	
					if (
						ctx.environment.toLocaleLowerCase() === "prod" ||
						ctx.environment.toLocaleLowerCase() === "production"
					){
						const confirmationMessage =
							await vscode.window.showQuickPick(
								["Yes", "No"],
								{placeHolder:"You are about to push code to Production. Are you sure?"}
							);
	
						if (confirmationMessage !== "Yes") {
							vscode.window.showInformationMessage("Push cancelled");
							return;
						}
					}
	
					const authData = ctx.auth;
					const responseData = await request(authData, 'POST', {
						fileName: ctx.fileName,
						message: encoded,
					});
	
					progress.report({ message: "Backing up old code..." });
					await new Promise((resolve) =>
						setTimeout(resolve, 100),
					);
	
					const oldContent = responseData.oldContent;
					console.log("Old Content:", oldContent);
	
					await saveBackup(ctx, oldContent);
	
					vscode.window.showInformationMessage(
						responseData?.message,
					);
				} catch (error) {
					console.error("Error", {message: error.message,stack: error.stack});
					vscode.window.showErrorMessage(JSON.stringify({
						message: error.message,
						stack: error.stack,
					}));
				}
			});
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	});

	const COMPARE_CODE = vscode.commands.registerCommand("suitescript-manager.compare-code",async () => {
		try{
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				progress.report({message: "Fetching File From NetSuite..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
	
				const ctx = await getContext();
	
				const authData = ctx.auth;
				const responseData = await request(authData, 'GET', {
					fileName: ctx.fileName,
					action: "getScriptContents",
				})
	
				const decoded = Buffer.from(
					responseData.contents,
					"base64",
				).toString("utf8");
	
				vscode.commands.executeCommand(
					"vscode.diff",
					vscode.Uri.file(ctx.filePath),
					await createVirtualDocument(decoded),
					`Local -> Netsuite (${ctx.fileName}) || ${ctx.environment}`,
				);
	
				vscode.window.showInformationMessage("success");
			})
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	});

	const GET_SEARCH_LIST = vscode.commands.registerCommand("suitescript-manager.get-search-list",async () => {
		try{

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				progress.report({message: "Fetching Search List From NetSuite..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
	
				const ctx = await getContext(false);
	
				const authData = ctx.auth;
				const responseData = await request(authData, 'GET', {
					action: "getSearchList"
				})
				vscode.window.showInformationMessage("List Retrieved");
	
				const searchList = responseData.list;
	
				const selectedSearch = await vscode.window.showQuickPick(
					searchList.map((search) => {
						return {
							label: search.title,
							description: search.recordType,
						};
					}),
					{placeHolder: "Select Search"}
				);
	
				if (!selectedSearch) {
					vscode.window.showErrorMessage("No search selected");
					return;
				}
	
				// @ts-ignore
				const searchObj = searchList.find((search) => search.title == selectedSearch.label);
				
				progress.report({message: "Fetching Preview Data from NetSuite..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
	
				const searchResponseData = await request(authData, 'GET', {
					searchId: searchObj.id,
					action: "previewSearch",
				})
	
				const panel = vscode.window.createWebviewPanel(
					"netsuiteSearchPreview",
					// @ts-ignore
					`Saved Search Preview - ${selectedSearch.label}`,
					vscode.ViewColumn.One,
					{ enableScripts: true },
				);
	
				const boilerplate = createBoilerplate(searchResponseData);
	
				panel.webview.html = renderTable(
					searchResponseData,
					boilerplate,
				);
	
				panel.webview.onDidReceiveMessage(async (message) => {
					if (message.command === "copyBoilerplate") {
						await vscode.env.clipboard.writeText(message.boilerplate);
						vscode.window.showInformationMessage("Search boilerplate copied");
					}
				});
			})
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	});

	const PULL_FROM_PRODUCTION = vscode.commands.registerCommand("suitescript-manager.pull-from-production",async () => {
		try{
			
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				progress.report({message: "Fetching file from NetSuite Production..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
				const ctx = await getContext(true, true);
	
				const authData = ctx.auth;
				const responseData = await request(authData, 'GET', {
					fileName: ctx.fileName,
					action: "getScriptContents",
				})
	
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
			});
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	});

	const PULL_FROM_CURRENT_ENVIRONMENT = vscode.commands.registerCommand("suitescript-manager.pull-from-current-environment",async () => {
		try{

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				progress.report({message: "Fetching file from NetSuite..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
				const ctx = await getContext();
	
				const authData = ctx.auth;
				const responseData = await request(authData, 'GET', {
					fileName: ctx.fileName,
					action: "getScriptContents",
				})
	
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
			});
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	});

	const OPEN_IN_NETSUITE = vscode.commands.registerCommand('suitescript-manager.open-in-netsuite', async () => {
		try{

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				progress.report({message: "Fetching Script ID from NetSuite..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
	
				const ctx = await getContext();
				const authData = ctx.auth;
				
				const responseData = await request(authData, 'GET', {
					fileName: ctx.fileName, 
					action: 'getScriptId' 
				})
		
				const scriptId = responseData.scriptId;
	
				const accountId = responseData.accountId;
				const fileUrl = `https://${accountId}.app.netsuite.com/app/common/media/mediaitem.nl?id=${scriptId}`;
				const scriptUrl = `https://${accountId}.app.netsuite.com/app/common/scripting/script.nl?id=${scriptId}`;
				const nsUrl = responseData.type === 'file' ? fileUrl : scriptUrl;
				vscode.env.openExternal(vscode.Uri.parse(nsUrl));
			})
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	});

	const GET_RECENT_LOGS = vscode.commands.registerCommand('suitescript-manager.fetch-recent-logs', async () => {
		try{

			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Processing",
				cancellable: false,
			},
			async (progress) => {
				progress.report({message: "Fetching Recent Logs from NetSuite..."});
				await new Promise((resolve) => setTimeout(resolve, 100));
	
				const ctx = await getContext();
				const authData = ctx.auth;
	
				const responseData = await request(authData, 'GET', {
					fileName: ctx.fileName, 
					action: 'fetchRecentLogs' 
				})
	
				getLogPanel(context);
	
				const logData = responseData.logs;
				const logs = formatLogs(logData);
	
				logPanel?.webview.postMessage({
					type: "logs",
					payload: logs
				});
			})
		}
		catch(error){
			vscode.window.showErrorMessage(error.message);
			process.exit(1);
		}
	})

	const CHECK_ENVIRONMENT = vscode.commands.registerCommand(
		"suitescript-manager.check-environment",
		async () => {},
	);

	// vscode.window.onDidChangeActiveTextEditor(async (editor) => {
	// 	if (!editor) return;

	// 	try {
	// 		const ctx = await getContext(true);
	// 		updateStatusBar({
	// 			env: ctx.environment,
	// 			authOk: true,
	// 			isProd: ctx.environment.toLowerCase() === "prod",
	// 		});
	// 	} catch {
	// 		updateStatusBar({
	// 			env: "Unknown",
	// 			authOk: false,
	// 			message: "Unable to resolve NetSuite context",
	// 		});
	// 	}
	// });


	context.subscriptions.push(PUSH_CODE);
	context.subscriptions.push(COMPARE_CODE);
	context.subscriptions.push(GET_SEARCH_LIST);
	context.subscriptions.push(PULL_FROM_PRODUCTION);
	context.subscriptions.push(PULL_FROM_CURRENT_ENVIRONMENT);
	context.subscriptions.push(CHECK_ENVIRONMENT);
	context.subscriptions.push(OPEN_IN_NETSUITE);
	context.subscriptions.push(GET_RECENT_LOGS);
}

// function updateStatusBar(ctx) {
// 	if (!netsuiteStatusBar) return;

// 	const env = ctx?.env ?? "Unknown";
// 	const auth = ctx?.authOk ? "Auth OK" : "Auth ❌";
// 	const envLabel = ctx?.isProd ? "PROD 🔥" : env;

// 	netsuiteStatusBar.text = `$(cloud-upload) NetSuite: ${envLabel} | ${auth}`;

// 	if (ctx?.message) {
// 		netsuiteStatusBar.tooltip = ctx.message;
// 	}
// }

// Optimized Backup using VS Code FileSystem API
async function saveBackup(ctx, oldContentBase64) {
    if (!oldContentBase64) return;

    const rootUri = vscode.workspace.workspaceFolders?.[0].uri;
    if (!rootUri) return;

    const relativePath = vscode.workspace.asRelativePath(ctx.filePath, false);
    const backupDir = vscode.Uri.joinPath(rootUri, 'Backup', path.dirname(relativePath));

    try {
        await vscode.workspace.fs.createDirectory(backupDir);
        const decoded = Buffer.from(oldContentBase64, "base64");
        
        const fileInfo = path.parse(ctx.fileName);
        const fileName = `${fileInfo.name}_${formatDate()}${fileInfo.ext}`;
        const backupUri = vscode.Uri.joinPath(backupDir, fileName);

        await vscode.workspace.fs.writeFile(backupUri, decoded);
    } catch (err) {
        vscode.window.showErrorMessage(`Backup failed: ${err.message}`);
    }
}


async function createVirtualDocument(content) {
	const doc = await vscode.workspace.openTextDocument({
		content,
		language: "javascript",
	});

	return doc.uri;
}

function formatLogs(logData){
	const logs = logData.map(log => {
		return {
			type: log.type.toUpperCase() || 'DEBUG',
			date: `${log.date} ${log.time}` || '',
			user: log.user || '',
			scriptType: log.scriptType || '',
			message: String(log.details) || ''
		}
	})

	return logs;
}

function renderTable(data, boilerplate) {
	const headers = data.columns
		.map((c) => `<th>${c.label || c.name}</th>`)
		.join("");

	const rows = data.rows.map((r) => `
		<tr>
		${Object.values(r)
				.map((v) => `<td>${v}</td>`)
				.join("")}
		</tr>
  	`).join("");

	return `
    <html>
      <body>
	  	<button id="copyBoilerplate">Copy Boilerplate</button>
        <table border="1" cellspacing="0" cellpadding="4">
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
		<script>
        const vscode = acquireVsCodeApi();
        const boilerplate = ${JSON.stringify(boilerplate)};

        document.getElementById('copyBoilerplate')
          .addEventListener('click', () => {
            vscode.postMessage({
              command: 'copyBoilerplate',
              boilerplate
            });
          });
      </script>
      </body>
    </html>
  `;
}
function createBoilerplate(data) {
	const lines = [];

	lines.push(`const searchObj = search.load({ id: '${data.searchId}' });`);
	lines.push("");
	lines.push("searchObj.run().each(result => {");

	data.columns.forEach((col) => {
		const opts = [`name: '${col.name}'`];
		if (col.join) opts.push(`join: '${col.join}'`);
		if (col.summary) opts.push(`summary: '${col.summary}'`);

		lines.push(
			`  const ${col.name.replace(
				/[^a-zA-Z0-9_]/g,
				"_",
			)} = result.getValue({ ${opts.join(", ")} });`,
		);
	});

	lines.push("");
	lines.push("  return true;");
	lines.push("});");

	return lines.join("\n");
}

	function getLogPanel(context) {
		if (logPanel) {
			logPanel.reveal(vscode.ViewColumn.One);
			return logPanel;
		}

		logPanel = vscode.window.createWebviewPanel(
			"netsuiteLogs",
			"NetSuite Live Logs",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
			}
		);

		logPanel.onDidDispose(() => {
			logPanel = undefined;
		});

		// Get path to the HTML file
		const filePath = path.join(context.extensionPath, 'media', 'logPanel.html');
		
		// Read the file and inject URIs for CSS/JS
		let htmlContent = fs.readFileSync(filePath, 'utf8');

		logPanel.webview.html = htmlContent;

		// logPanel.webview.html = getLogHtml();

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

function formatDate(d = new Date()) {
	const pad = (n) => String(n).padStart(2, "0");

	const day = pad(d.getDate());
	const month = pad(d.getMonth() + 1);
	const year = d.getFullYear();

	const hours = pad(d.getHours());
	const minutes = pad(d.getMinutes());

	return `${day}-${month}-${year} ${hours}-${minutes}`;
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
