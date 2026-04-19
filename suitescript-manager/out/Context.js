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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContext = getContext;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const ajv_1 = __importDefault(require("ajv"));
const vscode = __importStar(require("vscode"));
const AuthService_1 = require("./AuthService");
const ajv = new ajv_1.default();
const configCache = new Map();
const schema = {
    type: "object",
    patternProperties: {
        ".*": {
            type: "object",
            properties: {
                CLIENT_ID: { type: "string" },
                CLIENT_SECRET: { type: "string" },
                ACCESS_TOKEN: { type: "string" },
                ACCESS_SECRET: { type: "string" },
                REALM: { type: "string" },
                URL: { type: "string" },
            },
            required: ["CLIENT_ID", "CLIENT_SECRET", "ACCESS_TOKEN", "ACCESS_SECRET", "REALM", "URL"],
            additionalProperties: true,
        },
    },
    additionalProperties: false,
    minProperties: 1,
};
const validate = ajv.compile(schema);
async function pickEnvironment(config) {
    const environments = Object.keys(config);
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
    if (!workspaceFolder) {
        return null;
    }
    const configPath = path.join(workspaceFolder.uri.fsPath, ".ss-manager.json");
    if (!fs.existsSync(configPath)) {
        return null;
    }
    const mtimeMs = (await fs.promises.stat(configPath)).mtimeMs;
    const cached = configCache.get(configPath);
    if (cached && cached.mtimeMs === mtimeMs) {
        return cached.config;
    }
    const fileContent = await fs.promises.readFile(configPath, "utf-8");
    const parsedConfig = JSON.parse(fileContent);
    if (!validate(parsedConfig)) {
        throw new Error(`Invalid config format: ${ajv.errorsText(validate.errors)}`);
    }
    const config = parsedConfig;
    configCache.set(configPath, { mtimeMs, config });
    return config;
}
async function getContext(activeRequired = true, getProduction = false) {
    const editor = vscode.window.activeTextEditor;
    if (activeRequired && !editor) {
        throw new Error("No active editor found");
    }
    const filePath = editor?.document.fileName;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error("No workspace folder open");
    }
    const config = await loadConfig();
    if (!config) {
        throw new Error(".ss-manager.json not found");
    }
    const parts = filePath ? filePath.split(path.sep) : [];
    const envIndex = parts.findIndex((segment) => segment === workspaceFolder.name) + 1;
    let environment = activeRequired ? parts[envIndex] : await pickEnvironment(config);
    if (getProduction) {
        environment = Object.keys(config).find((env) => env.toLowerCase().includes("prod") ||
            env.toLowerCase().includes("production")) ?? "";
        if (!environment) {
            throw new Error("Production environment not configured");
        }
    }
    if (!environment || !config[environment]) {
        throw new Error(`Environment "${environment}" not configured in .ss-manager.json`);
    }
    return {
        editor,
        filePath,
        fileName: path.basename(filePath ?? ""),
        environment,
        config,
        auth: new AuthService_1.AuthService(config[environment]),
        envIndex,
        parts,
    };
}
//# sourceMappingURL=Context.js.map