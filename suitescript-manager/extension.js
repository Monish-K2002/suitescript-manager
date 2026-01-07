// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const OAuth = require("oauth-1.0a");
const crypto = require("crypto");
// let netsuiteStatusBar = null;

async function getContext(activeRequired = true, getProduction = false) {
	const editor = vscode.window.activeTextEditor;
	if (activeRequired && !editor) throw new Error("No active editor found");

	const filePath = editor?.document.fileName;
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) throw new Error("No workspace folder open");

	const config = loadConfig();
	if (!config) throw new Error(".ss-manager.json not found");

	const parts = filePath ? filePath.split(path.sep) : [];
	const envIndex = parts.findIndex((p) => p === workspaceFolder.name) + 1;
	let environment = activeRequired
		? parts[envIndex]
		: await pickEnvironment(config);

	if (getProduction) {
		const configEnvironments = Object.keys(config);
		environment = configEnvironments.find(
			(env) =>
				env.toLowerCase().includes("prod") ||
				env.toLowerCase().includes("production"),
		);
		if (!environment) {
			vscode.window.showErrorMessage(
				"Production environment not configured",
			);
			return;
		}

		if (!config[environment]) {
			vscode.window.showErrorMessage("Environment not configured");
			return;
		}
	}

	if (activeRequired && !getProduction && !config[environment]) {
		throw new Error(
			`Environment "${environment}" not configured in .ss-manager.json`,
		);
	}

	if (environment && !config[environment]) {
		throw new Error(
			`Environment "${environment}" not configured in .ss-manager.json`,
		);
	}

	return {
		editor,
		filePath,
		fileName: path.basename(filePath || ""),
		environment,
		config,
		auth: config[environment] ? new authRest(config[environment]) : null,
		envIndex,
		parts,
	};
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	async function callRestlet(auth, method, params = {}) {
		const { url, headers } = auth.getHeaders({ ...params, method });
		return axios.get(url, { params, headers });
	}

	async function postRestlet(auth, params) {
		const { url, headers, body } = auth.getHeaders(params);
		return axios.post(url, body, { headers });
	}

	let logPanel = null;

	function getLogPanel() {
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
				retainContextWhenHidden: true
			}
		);

		logPanel.onDidDispose(() => {
			logPanel = undefined;
		});

		logPanel.webview.html = getLogHtml();

		return logPanel;
	}

	function getLogHtml(){
		return `
		<!DOCTYPE html>
		<html>
		<head>
			<style>
				body {
					font-family: monospace;
					background: #1e1e1e;
					color: #ddd;
				}
				.log {
					white-space: pre-wrap;
					margin-bottom: 8px;
				}
				.ERROR { color: #f14c4c; }
				.WARN  { color: #cca700; }
				.DEBUG { color: #4fc1ff; }
				th, td {
					border: 1px solid #ffffffff;
					border-collapse: collapse;
					padding: 4px;
				}
			</style>
		</head>
		<body>
			<h3>NetSuite Live Logs</h3>
			<div id="logs">
				<table width='100%'>
					<thead>
						<tr>
							<th style="width: 15%;">Time</th>
							<th style="width: 10%;">Type</th>
							<th style="width: 15%;">User</th>
							<th style="width: 60%;">Message</th>
						</tr>
					</thead>
					<tbody id="logs-body"></tbody>
				</table>
			</div>

			<script>
				const vscode = acquireVsCodeApi();
				const container = document.getElementById("logs");

				window.addEventListener("message", event => {
					console.log('event.data',event.data);
					const msg = event.data;

					const tbody = document.getElementById("logs-body");
					msg.payload.forEach(logData => {
						const row = document.createElement("tr");
						row.innerHTML = \`
							<td align='center'>\${logData.date}</td>
							<td align='center'>\${logData.type}</td>
							<td align='center'>\${logData.user}</td>
							<td>\${logData.message}</td>
						\`;
						tbody.appendChild(row);
					})
				});
			</script>
		</body>
		</html>
		`
	}

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
				const response = await postRestlet(authData, {
					fileName: ctx.fileName,
					message: encoded,
					method: "POST",
				});

				const responseData = response.data;
				console.log("Response Data:", responseData);
				if (responseData.status !== "success") {
					vscode.window.showErrorMessage("Failed to push code");
					return;
				}

				progress.report({ message: "Backing up old code..." });
				await new Promise((resolve) =>
					setTimeout(resolve, 100),
				);

				const oldContent = responseData.oldContent;
				console.log("Old Content:", oldContent);

				const decoded = Buffer.from(
					responseData.oldContent,
					"base64",
				).toString("utf8");

				const dir = ctx.parts;

				dir.splice(ctx.envIndex, 0, "Backup");
				dir.pop();
				console.log("Backup directory:", dir.join("/"));

				if (!fs.existsSync(dir.join("/"))) {
					fs.mkdirSync(dir.join("/"), { recursive: true });
				}

				const backupFilePath = `${dir.join("/")}/${ctx.fileName.split(".")[0]}_${formatDate()}.js`;
				fs.writeFileSync(backupFilePath, decoded);

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
	});

	const COMPARE_CODE = vscode.commands.registerCommand("suitescript-manager.compare-code",async () => {
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
			const response = await callRestlet(authData, "GET", {
				fileName: ctx.fileName,
				action: "getScriptContents",
			});
			console.log("Response:", response.data);
			const responseData = response.data;

			if (responseData.status == "success") {
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
			} else {
				vscode.window.showErrorMessage(responseData?.message);
			}
		})
	});

	const GET_SEARCH_LIST = vscode.commands.registerCommand("suitescript-manager.get-search-list",async () => {
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
			const response = await callRestlet(authData, "GET", {
				action: "getSearchList",
			});
			console.log("Response:", response.data);
			const responseData = response.data;
			vscode.window.showInformationMessage("List Retrieved");

			if (responseData.status == "error"){
				vscode.window.showErrorMessage(responseData?.message);
				return;
			}
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

			const searchResponse = await callRestlet(authData, "GET", {
				searchId: searchObj.id,
				action: "previewSearch",
			});
			const searchResponseData = searchResponse.data;

			if (searchResponseData.status == "error") {
				vscode.window.showErrorMessage(searchResponseData?.message);
				return;
			}

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
	});

	const PULL_FROM_PRODUCTION = vscode.commands.registerCommand("suitescript-manager.pull-from-production",async () => {
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
			const response = await callRestlet(authData, "GET", {
				fileName: ctx.fileName,
				action: "getScriptContents",
			});
			console.log("Response:", response.data);
			const responseData = response.data;

			if (responseData.status == "success") {
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
			} else {
				vscode.window.showErrorMessage(responseData?.message);
			}
		});
	});

	const PULL_FROM_CURRENT_ENVIRONMENT = vscode.commands.registerCommand("suitescript-manager.pull-from-current-environment",async () => {
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
			const response = await callRestlet(authData, "GET", {
				fileName: ctx.fileName,
				action: "getScriptContents",
			});
			console.log("Response:", response.data);
			const responseData = response.data;

			if (responseData.status == "success") {
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
			} else {
				vscode.window.showErrorMessage(responseData?.message);
			}
		});
	});

	const OPEN_IN_NETSUITE = vscode.commands.registerCommand('suitescript-manager.open-in-netsuite', async () => {
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
			
			const response = await callRestlet(authData, 'GET', { 
				fileName: ctx.fileName, 
				action: 'getScriptId' 
			});
	
			const responseData = response.data;
	
			if (responseData.status !== 'success'){
				vscode.window.showErrorMessage(response.data.message);
				return;
			}
	
			const scriptId = responseData.scriptId;

			const accountId = responseData.accountId;
			const fileUrl = `https://${accountId}.app.netsuite.com/app/common/media/mediaitem.nl?id=${scriptId}`;
			const scriptUrl = `https://${accountId}.app.netsuite.com/app/common/scripting/script.nl?id=${scriptId}`;
			const nsUrl = responseData.type === 'file' ? fileUrl : scriptUrl;
			vscode.env.openExternal(vscode.Uri.parse(nsUrl));
		})
	});

	const GET_RECENT_LOGS = vscode.commands.registerCommand('suitescript-manager.fetch-recent-logs', async () => {
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

			const response = await callRestlet(authData, 'GET', { 
				fileName: ctx.fileName, 
				action: 'fetchRecentLogs' 
			});
	
			const responseData = response.data;

			if (responseData.status !== 'success'){
				vscode.window.showErrorMessage(response.data.message);
				return;
			}

			getLogPanel();

			const logData = responseData.logs;
			const logs = formatLogs(logData);

			logPanel?.webview.postMessage({
				type: "logs",
				payload: logs
			});
		})
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

async function pickEnvironment(config) {
	const environments = Object.keys(config || {});

	if (!environments.length) {
		throw new Error("No environments found in .ss-manager.json");
	}

	if (environments.length === 1) {
		return environments[0];
	}

	const selected = await vscode.window.showQuickPick(environments, {
		placeHolder: "Select NetSuite environment",
	});

	if (!selected) {
		throw new Error("Environment selection cancelled");
	}

	return selected;
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

function formatDate(d = new Date()) {
	const pad = (n) => String(n).padStart(2, "0");

	const day = pad(d.getDate());
	const month = pad(d.getMonth() + 1);
	const year = d.getFullYear();

	const hours = pad(d.getHours());
	const minutes = pad(d.getMinutes());

	return `${day}-${month}-${year} ${hours}-${minutes}`;
}

class authRest {
	constructor(config) {
		this.config = config;

		this.oauth = new OAuth({
			consumer: {
				key: this.config.CLIENT_ID,
				secret: this.config.CLIENT_SECRET,
			},
			signature_method: "HMAC-SHA256",
			hash_function: (base_string, key) =>
				crypto
					.createHmac("sha256", key)
					.update(base_string)
					.digest("base64"),
		});
	}

	getHeaders(params) {
		const url = this.config.URL;
		// Request data
		const requestData = {
			url,
			method: params.method,
		};
		if (params.method == "GET") {
			requestData.data = {};
			if (params.fileName) {
				requestData.data.fileName = params.fileName;
			}
			if (params.action) {
				requestData.data.action = params.action;
			}
			if (params.searchId) {
				requestData.data.searchId = params.searchId;
			}
		}

		const body = {};

		if (params.method == "POST") {
			// Payload you send to RESTlet
			body.action = "patch";
			body.message = params.message;
			body.fileName = params.fileName;
		}

		const headers = {
			Authorization:
				this.oauth.toHeader(
					this.oauth.authorize(requestData, {
						key: this.config.ACCESS_TOKEN,
						secret: this.config.ACCESS_SECRET,
					}),
				).Authorization + `, realm="${this.config.REALM}"`,
			"Content-Type": "application/json",
			Accept: "application/json",
		};

		return {
			url,
			body,
			headers,
		};
	}
}

function loadConfig() {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) return null;

	const configPath = path.join(
		workspaceFolder.uri.fsPath,
		".ss-manager.json",
	);

	if (!fs.existsSync(configPath)) return null;

	return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
