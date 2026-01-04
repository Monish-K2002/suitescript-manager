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

	const PUSH_CODE = vscode.commands.registerCommand('suitescript-manager.push-code', function () {
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
	
			const { url , body, headers } = getPostData(fileName,encoded,config[environment]);
	
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
	
			// vscode.commands.executeCommand(
			// "vscode.diff",
			// vscode.Uri.file(fileName),
			// vscode.Uri.file(fileName),
			// "Local -> Netsuite"
			// )	
	
			// Display a message box to the user
			
		} catch (error) {
			console.error('Error',{message: error.message, stack: error.stack})
			vscode.window.showErrorMessage(JSON.stringify({message: error.message, stack: error.stack}));
		}

	});

	const COMPARE_CODE = vscode.commands.registerCommand('suitescript-manager.compare-code', function () {
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

		const { url, headers } = prepareGETData(fileName,config[environment]);

		(async () => {
			try {
				const response = await axios.get(url, { params: {fileName},headers });
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
			} catch (err) {
				console.error('Error:', err.response?.data || err.message);
				vscode.window.showErrorMessage(err.response?.data || err.message);
			}
		})();
	})

	context.subscriptions.push(PUSH_CODE);
	context.subscriptions.push(COMPARE_CODE)
}

async function createVirtualDocument(content, filename) {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: "javascript"
  });

  return doc.uri;
}

function prepareGETData(fileName,config){
	const url = config.URL

	const oauth = new OAuth({
		consumer: {
			key: config?.CLIENT_ID,
			secret: config?.CLIENT_SECRET
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
		data: {fileName: fileName},
		method: 'GET'
	};

	const headers = new AxiosHeaders();

	headers.set(
		'Authorization',
		oauth.toHeader(
			oauth.authorize(requestData, {
			key: config.ACCESS_TOKEN,
			secret: config.ACCESS_SECRET
			})
		).Authorization + `, realm="${config.REALM}"`
	);


	headers.set('Content-Type', 'application/json');
	headers.set('Accept', 'application/json');

	return {
		url,
		headers
	}
}

function getPostData(fileName,encoded,config){
	// const url = 'https://td3050758.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=11089&deploy=1'
	const url = config.URL

	const oauth = new OAuth({
		consumer: {
			key: config?.CLIENT_ID,
			secret: config?.CLIENT_SECRET
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
		method: 'POST'
	};

	// Payload you send to RESTlet
	const body = {
		action: "patch",
		message: encoded,
		fileName: fileName
	};

	const headers = new AxiosHeaders();

	headers.set(
		'Authorization',
		oauth.toHeader(
			oauth.authorize(requestData, {
			key: config.ACCESS_TOKEN,
			secret: config.ACCESS_SECRET
			})
		).Authorization + `, realm="${config.REALM}"`
	);

	headers.set('Content-Type', 'application/json');
	headers.set('Accept', 'application/json');

	return {
		url,
		body,
		headers
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
