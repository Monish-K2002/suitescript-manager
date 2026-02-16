const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const {AuthService} = require("./AuthService");
const { Ajv } = require("ajv");
const ajv = new Ajv();
const configCache = new Map();

const schema = {
    type: "object",
    "patternProperties": {
        ".*": {
        "type": "object",
        "properties": {
            "CLIENT_ID": { "type": "string" },
            "CLIENT_SECRET": { "type": "string" },
            "ACCESS_TOKEN": { "type": "string" },
            "ACCESS_SECRET": { "type": "string" },
            "REALM": { "type": "string" },
            "URL": { "type": "string" }
        },
        "required": ["CLIENT_ID", "CLIENT_SECRET", "ACCESS_TOKEN", "ACCESS_SECRET", "REALM", "URL"],
        "additionalProperties": true
        }
    },
    "additionalProperties": false,
    "minProperties": 1
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

async function loadConfig() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const configPath = path.join(
        workspaceFolder.uri.fsPath,
        ".ss-manager.json",
    );

    if (!fs.existsSync(configPath)) return null;
    
    // Check cache to avoid repeated reads
    const mTime = fs.statSync(configPath).mtime;
    if (configCache.has(configPath) && configCache.get(configPath).mTime === mTime) {
        return configCache.get(configPath).config;
    }

    const fileContent = await fs.promises.readFile(configPath, "utf-8")

    const validate = ajv.compile(schema)
    const valid = validate(JSON.parse(fileContent))

    if (!valid) {
        throw new Error("Invalid Config format: " + ajv.errorsText(validate.errors));
    }

    // Cache config
    configCache.set(configPath, { mTime, config: JSON.parse(fileContent) });
    return JSON.parse(fileContent);
}

async function getContext(activeRequired = true, getProduction = false) {
    const editor = vscode.window.activeTextEditor;
    if (activeRequired && !editor){
        throw new Error("No active editor found");
    }

    const filePath = editor?.document.fileName;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder){
        throw new Error("No workspace folder open");
    }

    const config = await loadConfig();
    if (!config){
        throw new Error(".ss-manager.json not found");
    }

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
            throw new Error("Production environment not configured");
        }

        if (!config[environment]) {
            throw new Error("Environment not configured");
        }
    }

    if (activeRequired && !getProduction && !config[environment]) {
        throw new Error(`Environment "${environment}" not configured in .ss-manager.json`);
    }

    if (environment && !config[environment]) {
        throw new Error(`Environment "${environment}" not configured in .ss-manager.json`);
    }

    return {
        editor,
        filePath,
        fileName: path.basename(filePath || ""),
        environment,
        config,
        auth: config[environment] ? new AuthService(config[environment]) : null,
        envIndex,
        parts,
    };
}

module.exports = {
    getContext,
};