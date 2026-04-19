"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
class Utils {
    logPanel;
    async saveBackup(ctx, oldContentBase64) {
        if (!oldContentBase64) {
            return;
        }
        const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!rootUri || !ctx.filePath) {
            return;
        }
        const relativePath = vscode.workspace.asRelativePath(ctx.filePath, false);
        const backupDir = vscode.Uri.joinPath(rootUri, "Backup", path.dirname(relativePath));
        try {
            await vscode.workspace.fs.createDirectory(backupDir);
            const decoded = Buffer.from(oldContentBase64, "base64");
            const fileInfo = path.parse(ctx.fileName);
            const fileName = `${fileInfo.name}_${this.formatDate()}${fileInfo.ext}`;
            const backupUri = vscode.Uri.joinPath(backupDir, fileName);
            await vscode.workspace.fs.writeFile(backupUri, decoded);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Backup failed: ${this.getErrorMessage(error)}`);
        }
    }
    getLogPanel(context) {
        if (this.logPanel) {
            this.logPanel.reveal(vscode.ViewColumn.One);
            return this.logPanel;
        }
        this.logPanel = vscode.window.createWebviewPanel("netsuiteLogs", "NetSuite Live Logs", vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
        });
        this.logPanel.onDidDispose(() => {
            this.logPanel = undefined;
        });
        const filePath = path.join(context.extensionPath, "media", "logPanel.html");
        this.logPanel.webview.html = fs.readFileSync(filePath, "utf8");
        return this.logPanel;
    }
    formatLogs(logData) {
        return logData.map((log) => ({
            type: String(log.type ?? "DEBUG").toUpperCase(),
            date: `${log.date ?? ""} ${log.time ?? ""}`.trim(),
            user: log.user ?? "",
            scriptType: log.scriptType ?? "",
            message: String(log.details ?? ""),
        }));
    }
    async createVirtualDocument(content) {
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: "javascript",
        });
        return doc.uri;
    }
    createBoilerplate(data) {
        const lines = [
            `const searchObj = search.load({ id: '${data.searchId}' });`,
            "",
            "searchObj.run().each(result => {",
        ];
        data.columns.forEach((column) => {
            const opts = [`name: '${column.name}'`];
            if (column.join) {
                opts.push(`join: '${column.join}'`);
            }
            if (column.summary) {
                opts.push(`summary: '${column.summary}'`);
            }
            lines.push(`  const ${column.name.replace(/[^a-zA-Z0-9_]/g, "_")} = result.getValue({ ${opts.join(", ")} });`);
        });
        lines.push("");
        lines.push("  return true;");
        lines.push("});");
        return lines.join("\n");
    }
    renderTable(data, boilerplate) {
        const headers = data.columns
            .map((column) => `<th>${this.escapeHtml(column.label || column.name)}</th>`)
            .join("");
        const rows = data.rows
            .map((row) => `
            <tr>
            ${Object.values(row)
            .map((value) => `<td>${this.escapeHtml(value)}</td>`)
            .join("")}
            </tr>
        `)
            .join("");
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
    formatDate(date = new Date()) {
        const pad = (value) => String(value).padStart(2, "0");
        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        return `${day}-${month}-${year} ${hours}-${minutes}`;
    }
    escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }
    getErrorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}
exports.default = new Utils();
//# sourceMappingURL=Utils.js.map