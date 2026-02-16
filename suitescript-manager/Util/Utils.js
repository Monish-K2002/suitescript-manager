const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

class Utils {
    constructor() {
        this.logPanel = null;
    }
    // Optimized Backup using VS Code FileSystem API
    async saveBackup(ctx, oldContentBase64) {
        if (!oldContentBase64) return;
    
        const rootUri = vscode.workspace.workspaceFolders?.[0].uri;
        if (!rootUri) return;
    
        const relativePath = vscode.workspace.asRelativePath(ctx.filePath, false);
        const backupDir = vscode.Uri.joinPath(rootUri, 'Backup', path.dirname(relativePath));
    
        try {
            await vscode.workspace.fs.createDirectory(backupDir);
            const decoded = Buffer.from(oldContentBase64, "base64");
            
            const fileInfo = path.parse(ctx.fileName);
            const fileName = `${fileInfo.name}_${this.#formatDate()}${fileInfo.ext}`;
            const backupUri = vscode.Uri.joinPath(backupDir, fileName);
    
            await vscode.workspace.fs.writeFile(backupUri, decoded);
        } catch (err) {
            vscode.window.showErrorMessage(`Backup failed: ${err.message}`);
        }
    }

    getLogPanel(context) {
        if (this.logPanel) {
            this.logPanel.reveal(vscode.ViewColumn.One);
            return this.logPanel;
        }

        this.logPanel = vscode.window.createWebviewPanel(
            "netsuiteLogs",
            "NetSuite Live Logs",
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
        );

        this.logPanel.onDidDispose(() => {
            this.logPanel = undefined;
        });

        // Get path to the HTML file
        const filePath = path.join(context.extensionPath, 'media', 'logPanel.html');
        
        // Read the file and inject URIs for CSS/JS
        let htmlContent = fs.readFileSync(filePath, 'utf8');

        this.logPanel.webview.html = htmlContent;

        // logPanel.webview.html = getLogHtml();

    }

    formatLogs(logData){
        const logs = logData.map(log => {
            const type = String(log?.type || "DEBUG").toUpperCase();
            return {
                type,
                date: `${log?.date || ""} ${log?.time || ""}`.trim(),
                user: log?.user || '',
                scriptType: log?.scriptType || '',
                message: String(log?.details ?? '')
            }
        })

        return logs;
    }

    async createVirtualDocument(content) {
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: "javascript",
        });
    
        return doc.uri;
    }

    createBoilerplate(data) {
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

    renderTable(data, boilerplate) {
        const headers = data.columns
            .map((c) => `<th>${this.#escapeHtml(c.label || c.name)}</th>`)
            .join("");

        const rows = data.rows.map((r) => `
            <tr>
            ${Object.values(r)
                    .map((v) => `<td>${this.#escapeHtml(v)}</td>`)
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

    #formatDate(d = new Date()) {
        const pad = (n) => String(n).padStart(2, "0");

        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();

        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());

    	return `${day}-${month}-${year} ${hours}-${minutes}`;
    }

    #escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }
}

module.exports = Utils;
