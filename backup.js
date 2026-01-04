// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs')
const path = require('path')
const https = require('https')
const axios = require('axios')
const { AxiosHeaders } = require('axios')
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	async function callRestlet(auth,method, params) {
		const { url, headers } = auth.getHeaders({...params, method});
		return axios.get(url, { params, headers });
	}

	const PUSH_CODE = vscode.commands.registerCommand('suitescript-manager.push-code', () => {
		try {
			const filePath = vscode.window.activeTextEditor.document.fileName

			const fileName = path.basename(filePath);
			const workspaceFolder = vscode.workspace.workspaceFolders[0].name;
	
			const parts = filePath.split(path.sep);
			const envIndex = parts.findIndex(p => p === workspaceFolder) + 1;
			const environment = parts[envIndex];
	
			console.log({ fileName, environment });
	
			const config = loadConfig()
			console.log('config',config)

			if(!config[environment]){
				vscode.window.showErrorMessage('Environment not configured');
				return;
			}
	
			const fileContent = vscode.window.activeTextEditor.document.getText();
			const encoded = Buffer.from(fileContent, 'utf8').toString('base64');

			const authData = new authRest(config[environment]);
	
			const { url , body, headers } = authData.getHeaders({fileName, method: 'POST', message: encoded});
	
			(async () => {
				try {
					const response = await axios.post(url, body, { headers });
					console.log('Response:', response.data);
					const responseData = response.data
					if(responseData.status == 'success'){
						vscode.window.showInformationMessage(responseData?.message);
					}
					else{
						vscode.window.showErrorMessage(responseData?.message);
					}
				} catch (err) {
					console.error('Error:', err.response?.data || err.message);
					vscode.window.showErrorMessage(err.response?.data || err.message);
				}
			})();
			
		} catch (error) {
			console.error('Error',{message: error.message, stack: error.stack})
			vscode.window.showErrorMessage(JSON.stringify({message: error.message, stack: error.stack}));
		}

	});

	const COMPARE_CODE = vscode.commands.registerCommand('suitescript-manager.compare-code', async() => {
		console.log('In Compare Code')
		const filePath = vscode.window.activeTextEditor.document.fileName

		const fileName = path.basename(filePath);
		const workspaceFolder = vscode.workspace.workspaceFolders[0].name;

		const parts = filePath.split(path.sep);
		const envIndex = parts.findIndex(p => p === workspaceFolder) + 1;
		const environment = parts[envIndex];

		console.log({ fileName, environment });

		const config = loadConfig()
		console.log('config',config)

		if(!config[environment]){
			vscode.window.showErrorMessage('Environment not configured');
			return;
		}

		const authData = new authRest(config[environment]);
		const response = await callRestlet(authData, 'GET',{fileName: fileName, action: 'compareFile'});
		console.log('Response:', response.data);
		const responseData = response.data

		if(responseData.status == 'success'){
			const decoded = Buffer.from(responseData.contents, 'base64').toString('utf8');

			vscode.commands.executeCommand(
				"vscode.diff",
				vscode.Uri.file(filePath),
				await createVirtualDocument(decoded, "NetSuite"),
				"Local -> Netsuite"
			)	

			vscode.window.showInformationMessage('success');
		}
		else{
			vscode.window.showErrorMessage(responseData?.message);
		}

		// const { url, headers } = authData.getHeaders({fileName: fileName, method: 'GET', action: 'compareFile'});

		// (async () => {
		// 	try {
		// 		const response = await axios.get(url, { params: {fileName, action: 'compareFile'},headers });
		// 		console.log('Response:', response.data);
		// 		const responseData = response.data
		// 		if(responseData.status == 'success'){
		// 			const decoded = Buffer.from(responseData.contents, 'base64').toString('utf8');

		// 			vscode.commands.executeCommand(
		// 				"vscode.diff",
		// 				vscode.Uri.file(filePath),
		// 				await createVirtualDocument(decoded, "NetSuite"),
		// 				"Local -> Netsuite"
		// 			)	

		// 			vscode.window.showInformationMessage('success');
		// 		}
		// 		else{
		// 			vscode.window.showErrorMessage(responseData?.message);
		// 		}
		// 	} catch (err) {
		// 		console.error('Error:', err.response?.data || err.message);
		// 		vscode.window.showErrorMessage(err.response?.data || err.message);
		// 	}
		// })();
	});

	const GET_SEARCH_LIST = vscode.commands.registerCommand('suitescript-manager.get-search-list', async () => {
		console.log('In Get Search List')

		const config = loadConfig()
		console.log('config',config)

		const environment = await pickEnvironment(config)

		console.log({ environment })
		if(!config[environment]){
			vscode.window.showErrorMessage('Environment not configured');
			return;
		}

		const authData = new authRest(config[environment]);
		const { url, headers } = authData.getHeaders({method: 'GET', action: 'getSearchList'});

		(async () => {
			try {
				const response = await axios.get(url, { params: {action: 'getSearchList'},headers });
				console.log('Response:', response.data);
				const responseData = response.data
				if(responseData.status == 'success'){
					const searchList = responseData.list

					const selectedSearch = await vscode.window.showQuickPick(searchList.map((search) => {return {label: search.title, description: search.recordType}}), {
						placeHolder: 'Select Search'
					});

					if(!selectedSearch){
						vscode.window.showErrorMessage('No search selected');
						return;
					}

					const searchObj = searchList.find((search) => search.title == selectedSearch)
					console.log('searchObj',searchObj)

					const authData = new authRest(config[environment]);
					const { url, headers } = authData.getHeaders({method: 'GET', action: 'previewSearch', searchId: searchObj.id});
					vscode.window.showInformationMessage(searchObj);
				}
				else{
					vscode.window.showErrorMessage(responseData?.message);
				}
			} catch (err) {
				console.error('Error:', err.response?.data || err.message);
				vscode.window.showErrorMessage(err.response?.data || err.message);
			}
		})();
	})

	context.subscriptions.push(PUSH_CODE);
	context.subscriptions.push(COMPARE_CODE);
	context.subscriptions.push(GET_SEARCH_LIST);
}

async function pickEnvironment(config) {
	const environments = Object.keys(config || {});

	if (!environments.length) {
		throw new Error('No environments found in .ss-manager.json');
	}

	if (environments.length === 1) {
		return environments[0];
	}

	const selected = await vscode.window.showQuickPick(environments, {
		placeHolder: 'Select NetSuite environment'
	});

	if (!selected) {
		throw new Error('Environment selection cancelled');
	}

	return selected;
}

async function createVirtualDocument(content, filename) {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: "javascript"
  });

  return doc.uri;
}


class authRest{
	constructor(config){
		this.config = config
	}

	getHeaders(params){
		const url = this.config.URL
		
		const oauth = new OAuth({
			consumer: {
				key: this.config?.CLIENT_ID,
				secret: this.config?.CLIENT_SECRET
			},
			signature_method: 'HMAC-SHA256',
			hash_function(base_string, key) {
				return crypto
				.createHmac('sha256', key)
				.update(base_string)
				.digest('base64');
			}
		});

		// Request data
		const requestData = {
			url,
			method: params.method
		};
		if(params.method == 'GET'){
			requestData.data = {}
			if(params.fileName){
				requestData.data.fileName = params.fileName
			}
			if(params.action){
				requestData.data.action = params.action
			}
		}

		const body = {}

		if(params.method == 'POST'){
			// Payload you send to RESTlet
			body.action = "patch" 
			body.message = params.message
			body.fileName = params.fileName
		}

		const headers = {
			Authorization:
				oauth.toHeader(
					oauth.authorize(requestData, {
						key: this.config.ACCESS_TOKEN,
						secret: this.config.ACCESS_SECRET
					})
				).Authorization + `, realm="${this.config.REALM}"`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		};

		return {
			url,
			body,
			headers
		}
	}
}

function loadConfig(){
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  	if (!workspaceFolder) return null;

	const configPath = path.join(
		workspaceFolder.uri.fsPath,
		'.ss-manager.json'
	);

	if (!fs.existsSync(configPath)) return null;

	return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
