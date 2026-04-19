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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const ajv_1 = __importDefault(require("ajv"));
const vscode = __importStar(require("vscode"));
const ajv = new ajv_1.default();
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
class ConfigService {
    configCache = new Map();
    configFileName = ".ss-manager.json";
    getConfigPath() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error("No workspace folder open");
        }
        return path.join(workspaceFolder.uri.fsPath, this.configFileName);
    }
    async loadConfig() {
        const configPath = this.getConfigPath();
        if (!fs.existsSync(configPath)) {
            // throw new Error(`${this.configFileName} not found`);
            fs.writeFileSync(configPath, "{}", "utf-8");
        }
        const mtimeMs = (await fs.promises.stat(configPath)).mtimeMs;
        const cached = this.configCache.get(configPath);
        if (cached && cached.mtimeMs === mtimeMs) {
            return cached.config;
        }
        const fileContent = await fs.promises.readFile(configPath, "utf-8");
        const parsedConfig = JSON.parse(fileContent);
        if (!validate(parsedConfig)) {
            throw new Error(`Invalid config format: ${ajv.errorsText(validate.errors)}`);
        }
        const config = parsedConfig;
        this.configCache.set(configPath, { mtimeMs, config });
        return config;
    }
    async saveConfig(config) {
        const configPath = this.getConfigPath();
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
        const mtimeMs = (await fs.promises.stat(configPath)).mtimeMs;
        this.configCache.set(configPath, { mtimeMs, config });
    }
    async getEnvironment(environment) {
        const config = await this.loadConfig();
        const envConfig = config[environment];
        if (!envConfig) {
            throw new Error(`Environment "${environment}" not configured in ${this.configFileName}`);
        }
        return envConfig;
    }
    async setEnvironment(environment, envConfig) {
        const config = await this.loadConfig();
        config[environment] = envConfig;
        await this.saveConfig(config);
        return config;
    }
    async getEnvironments() {
        const config = await this.loadConfig();
        return Object.keys(config);
    }
    async environmentExists(environment) {
        const config = await this.loadConfig();
        return environment in config;
    }
    clearCache() {
        this.configCache.clear();
    }
}
exports.default = new ConfigService();
//# sourceMappingURL=ConfigService.js.map