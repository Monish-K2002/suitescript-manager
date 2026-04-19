import * as fs from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";

import type {
    ExtensionContextData,
    FormattedLogEntry,
    PreviewSearchResponse,
    RawLogEntry,
} from "../types";

class Utils {
    public logPanel: vscode.WebviewPanel | undefined;

    public async saveBackup(ctx: ExtensionContextData, oldContentBase64: string): Promise<void> {
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
        } catch (error) {
            vscode.window.showErrorMessage(`Backup failed: ${this.getErrorMessage(error)}`);
        }
    }

    public getLogPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
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
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
            },
        );

        this.logPanel.onDidDispose(() => {
            this.logPanel = undefined;
        });

        const filePath = path.join(context.extensionPath, "media", "logPanel.html");
        this.logPanel.webview.html = fs.readFileSync(filePath, "utf8");

        return this.logPanel;
    }

    public formatLogs(logData: RawLogEntry[]): FormattedLogEntry[] {
        return logData.map((log) => ({
            type: String(log.type ?? "DEBUG").toUpperCase(),
            date: `${log.date ?? ""} ${log.time ?? ""}`.trim(),
            user: log.user ?? "",
            scriptType: log.scriptType ?? "",
            message: String(log.details ?? ""),
        }));
    }

    public async createVirtualDocument(content: string): Promise<vscode.Uri> {
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: "javascript",
        });

        return doc.uri;
    }

    public createBoilerplate(data: PreviewSearchResponse): string {
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

            lines.push(
                `  const ${column.name.replace(/[^a-zA-Z0-9_]/g, "_")} = result.getValue({ ${opts.join(", ")} });`,
            );
        });

        lines.push("");
        lines.push("  return true;");
        lines.push("});");

        return lines.join("\n");
    }

    public renderTable(data: PreviewSearchResponse, boilerplate: string): string {
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

    private formatDate(date = new Date()): string {
        const pad = (value: number) => String(value).padStart(2, "0");

        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());

        return `${day}-${month}-${year} ${hours}-${minutes}`;
    }

    private escapeHtml(value: unknown): string {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}

export default new Utils();
