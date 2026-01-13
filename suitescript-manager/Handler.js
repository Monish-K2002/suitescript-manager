const vscode = require("vscode");
const {getContext} = require("./Context");
const {request} = require('./Request')
const Utils = require("./Util/Utils");
const utils = new Utils();

class CommandHandler {
    /**
     * Optimized Wrapper
     * @param {Function} task - The logic to execute
     */
    async runTask(task) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "SuiteScript Manager",
            cancellable: false,
        }, async (progress) => {
            try {
                // We pass 'progress' into the task so the task can update the UI
                await task(progress);
            } catch (error) {
                vscode.window.showErrorMessage(`Operation failed: ${error.message}`);
                console.error(error);
            }
        });
    }

    async handlePushCode(progress) {
        // 1. Setup Context
        progress.report({ message: "Preparing context..." });
        const ctx = await getContext();
        
        // 2. Environment Guard (Production Check)
        const isProduction = ["prod", "production"].includes(ctx.environment.toLowerCase());
        if (isProduction) {
            const confirm = await vscode.window.showQuickPick(["Yes", "No"], {
                placeHolder: "⚠️ You are pushing to PRODUCTION. Are you sure?"
            });
            if (confirm !== "Yes") {
                vscode.window.showInformationMessage("Push cancelled");
                return;
            }
        }

        // 3. Process Content
        progress.report({ message: "Uploading to NetSuite..." });
        const fileContent = ctx.editor.document.getText();
        const encoded = Buffer.from(fileContent, "utf8").toString("base64");

        const responseData = await request(ctx.auth, 'POST', {
            fileName: ctx.fileName,
            message: encoded,
        });

        // 4. Backup Logic
        progress.report({ message: "Creating local backup..." });
        if (responseData.oldContent) {
            await utils.saveBackup(ctx, responseData.oldContent);
        }

        vscode.window.showInformationMessage(responseData?.message || "Success");
    }

    async handleCompareCode(progress) {
        progress.report({message: "Fetching File From NetSuite..."});
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext();

        const authData = ctx.auth;
        const responseData = await request(authData, 'GET', {
            fileName: ctx.fileName,
            action: "getScriptContents",
        })

        const decoded = Buffer.from(responseData.contents,"base64").toString("utf8");

        vscode.commands.executeCommand(
            "vscode.diff",
            vscode.Uri.file(ctx.filePath),
            await utils.createVirtualDocument(decoded),
            `Local -> Netsuite (${ctx.fileName}) || ${ctx.environment}`,
        );

        vscode.window.showInformationMessage("success");
    }

    async handleGetSearchList(progress) {
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

        const boilerplate = utils.createBoilerplate(searchResponseData);

        panel.webview.html = utils.renderTable(
            searchResponseData,
            boilerplate,
        );

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === "copyBoilerplate") {
                await vscode.env.clipboard.writeText(message.boilerplate);
                vscode.window.showInformationMessage("Search boilerplate copied");
            }
        });
    }

    async handlePullFromProduction(progress){
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
    }

    async handlePullFromCurrentEnvironment(progress){
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
    }

    async handleOpenInNetSuite(progress){
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
    }

    async handleFetchRecentLogs(progress){
        progress.report({message: "Fetching Recent Logs from NetSuite..."});
        await new Promise((resolve) => setTimeout(resolve, 100));

        const ctx = await getContext();
        const authData = ctx.auth;

        const responseData = await request(authData, 'GET', {
            fileName: ctx.fileName, 
            action: 'fetchRecentLogs' 
        })

        utils.getLogPanel(context);

        const logData = responseData.logs;
        const logs = utils.formatLogs(logData);

        utils.logPanel?.webview.postMessage({
            type: "logs",
            payload: logs
        });
    }

    // async handleCheckEnvironment(progress){

    // }
}

module.exports = CommandHandler;