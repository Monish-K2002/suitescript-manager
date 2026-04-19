import type { Memento } from "vscode";

import type { CacheEntry, CacheScope } from "./types";

class CacheService {
    private readonly globalState: Memento;

    private readonly prefix = "ssm-cache:v1";

    public constructor(globalState: Memento) {
        this.globalState = globalState;
    }

    public async getOrSet<T>(scope: CacheScope, ttlMs: number, loader: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(scope);
        if (cached !== undefined) {
            return cached;
        }

        const value = await loader();
        await this.set(scope, value, ttlMs);
        return value;
    }

    public async get<T>(scope: CacheScope): Promise<T | undefined> {
        const key = this.buildKey(scope);
        const entry = this.globalState.get<CacheEntry<T>>(key);
        if (!entry) {
            return undefined;
        }

        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
            await this.globalState.update(key, undefined);
            return undefined;
        }

        return entry.value;
    }

    public async set<T>(scope: CacheScope, value: T, ttlMs: number): Promise<void> {
        const key = this.buildKey(scope);
        const now = Date.now();

        await this.globalState.update(key, {
            value,
            createdAt: now,
            expiresAt: ttlMs > 0 ? now + ttlMs : null,
        } satisfies CacheEntry<T>);
    }

    public async invalidate(partialScope: CacheScope = {}): Promise<number> {
        const fragments = this.buildFragments(partialScope);
        const keys = this.globalState.keys();

        const candidates = keys.filter((key) => {
            if (!key.startsWith(this.prefix)) {
                return false;
            }

            return fragments.every((fragment) => key.includes(fragment));
        });

        await Promise.all(
            candidates.map((key) => this.globalState.update(key, undefined)),
        );

        return candidates.length;
    }

    private buildKey(scope: CacheScope): string {
        const segments = {
            account: this.normalize(scope.accountKey),
            env: this.normalize(scope.environment),
            ws: this.normalize(scope.workspaceKey),
            action: this.normalize(scope.action),
            file: this.normalize(scope.fileName ?? ""),
            search: this.normalize(scope.searchId ?? ""),
        };

        return `${this.prefix}:account=${segments.account}:env=${segments.env}:ws=${segments.ws}:action=${segments.action}:file=${segments.file}:search=${segments.search}`;
    }

    private buildFragments(partialScope: CacheScope): string[] {
        const map: Record<keyof CacheScope, string> = {
            accountKey: "account",
            environment: "env",
            workspaceKey: "ws",
            action: "action",
            fileName: "file",
            searchId: "search",
        };

        return (Object.entries(map) as Array<[keyof CacheScope, string]>)
            .filter(([sourceKey]) => partialScope[sourceKey] !== undefined && partialScope[sourceKey] !== null)
            .map(([sourceKey, targetKey]) => `:${targetKey}=${this.normalize(partialScope[sourceKey])}`);
    }

    private normalize(value: unknown): string {
        return encodeURIComponent(String(value ?? "").toLowerCase());
    }
}

export default CacheService;
