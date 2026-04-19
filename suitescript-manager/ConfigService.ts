import * as fs from "node:fs";
import * as path from "node:path";

import Ajv from "ajv";
import * as vscode from "vscode";

import type { NetSuiteConfig, NetSuiteEnvironmentConfig } from "./types";

const ajv = new Ajv();

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
} as const;

const validate = ajv.compile(schema);

interface CacheEntry {
    mtimeMs: number;
    config: NetSuiteConfig;
}

class ConfigService {
    private readonly configCache = new Map<string, CacheEntry>();
    private readonly configFileName = ".ss-manager.json";

    public getConfigPath(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error("No workspace folder open");
        }
        return path.join(workspaceFolder.uri.fsPath, this.configFileName);
    }

    public async loadConfig(): Promise<NetSuiteConfig> {
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
        const parsedConfig: unknown = JSON.parse(fileContent);
        if (!validate(parsedConfig)) {
            throw new Error(`Invalid config format: ${ajv.errorsText(validate.errors)}`);
        }

        const config = parsedConfig as NetSuiteConfig;
        this.configCache.set(configPath, { mtimeMs, config });
        return config;
    }

    public async saveConfig(config: NetSuiteConfig): Promise<void> {
        const configPath = this.getConfigPath();
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

        const mtimeMs = (await fs.promises.stat(configPath)).mtimeMs;
        this.configCache.set(configPath, { mtimeMs, config });
    }

    public async getEnvironment(environment: string): Promise<NetSuiteEnvironmentConfig> {
        const config = await this.loadConfig();
        const envConfig = config[environment];
        if (!envConfig) {
            throw new Error(`Environment "${environment}" not configured in ${this.configFileName}`);
        }
        return envConfig;
    }

    public async setEnvironment(environment: string, envConfig: NetSuiteEnvironmentConfig): Promise<NetSuiteConfig> {
        const config = await this.loadConfig();
        config[environment] = envConfig;
        await this.saveConfig(config);
        return config;
    }

    public async getEnvironments(): Promise<string[]> {
        const config = await this.loadConfig();
        return Object.keys(config);
    }

    public async environmentExists(environment: string): Promise<boolean> {
        const config = await this.loadConfig();
        return environment in config;
    }

    public clearCache(): void {
        this.configCache.clear();
    }
}

export default new ConfigService();
