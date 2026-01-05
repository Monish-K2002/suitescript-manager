// /**
//  * Centralized helper to get environment, file info, and config in one go.
//  */
// async function getContext(activeRequired = true) {
//     const editor = vscode.window.activeTextEditor;
//     if (activeRequired && !editor) throw new Error('No active editor found');

//     const filePath = editor?.document.fileName;
//     const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
//     if (!workspaceFolder) throw new Error('No workspace folder open');

//     const config = loadConfig();
//     if (!config) throw new Error('.ss-manager.json not found');

//     const parts = filePath ? filePath.split(path.sep) : [];
//     const envIndex = parts.findIndex(p => p === workspaceFolder.name) + 1;
//     const environment = parts[envIndex];

//     if (activeRequired && !config[environment]) {
//         throw new Error(`Environment "${environment}" not configured in .ss-manager.json`);
//     }

//     return { editor, filePath, fileName: path.basename(filePath || ''), environment, config, auth: config[environment] ? new authRest(config[environment]) : null };
// }

// getHeaders(params) {
//     const oauth = new OAuth({
//         consumer: { key: this.config.CLIENT_ID, secret: this.config.CLIENT_SECRET },
//         signature_method: 'HMAC-SHA256',
//         hash_function: (base_string, key) => crypto.createHmac('sha256', key).update(base_string).digest('base64')
//     });

//     const requestData = {
//         url: this.config.URL,
//         method: params.method,
//         // OAuth 1.0a requires query params to be part of the signature for GET
//         data: params.method === 'GET' ? params.queryParams : {}
//     };

//     const headerObj = oauth.toHeader(oauth.authorize(requestData, {
//         key: this.config.ACCESS_TOKEN,
//         secret: this.config.ACCESS_SECRET
//     }));

//     return {
//         url: this.config.URL,
//         headers: {
//             ...headerObj,
//             'Authorization': `${headerObj.Authorization}, realm="${this.config.REALM}"`,
//             'Content-Type': 'application/json'
//         },
//         body: params.method === 'POST' ? params.body : null
//     };
// }

// const PUSH_CODE = vscode.commands.registerCommand('suitescript-manager.push-code', async () => {
//     await vscode.window.withProgress({
//         location: vscode.ProgressLocation.Notification,
//         title: "Pushing to NetSuite...",
//         cancellable: false
//     }, async (progress) => {
//         const ctx = await getContext();
//         const fileContent = ctx.editor.document.getText();
//         const encoded = Buffer.from(fileContent, 'utf8').toString('base64');

//         const { url, body, headers } = ctx.auth.getHeaders({
//             method: 'POST',
//             body: { action: 'patch', fileName: ctx.fileName, message: encoded }
//         });

//         const response = await axios.post(url, body, { headers });
//         // Handle response...
//     });
// });