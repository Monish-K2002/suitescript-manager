class CacheService {
    constructor(globalState) {
        this.globalState = globalState;
        this.prefix = "ssm-cache:v1";
    }

    async getOrSet(scope, ttlMs, loader) {
        const cached = await this.get(scope);
        if (cached !== undefined) {
            return cached;
        }

        const value = await loader();
        await this.set(scope, value, ttlMs);
        return value;
    }

    async get(scope) {
        const key = this.#buildKey(scope);
        const entry = this.globalState.get(key);
        if (!entry) {
            return undefined;
        }

        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            await this.globalState.update(key, undefined);
            return undefined;
        }

        return entry.value;
    }

    async set(scope, value, ttlMs) {
        const key = this.#buildKey(scope);
        const now = Date.now();

        await this.globalState.update(key, {
            value,
            createdAt: now,
            expiresAt: ttlMs > 0 ? now + ttlMs : null,
        });
    }

    async invalidate(partialScope = {}) {
        const fragments = this.#buildFragments(partialScope);
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
    }

    #buildKey(scope) {
        const segments = {
            account: this.#normalize(scope.accountKey),
            env: this.#normalize(scope.environment),
            ws: this.#normalize(scope.workspaceKey),
            action: this.#normalize(scope.action),
            file: this.#normalize(scope.fileName || ""),
            search: this.#normalize(scope.searchId || ""),
        };

        return `${this.prefix}:account=${segments.account}:env=${segments.env}:ws=${segments.ws}:action=${segments.action}:file=${segments.file}:search=${segments.search}`;
    }

    #buildFragments(partialScope) {
        const map = {
            accountKey: "account",
            environment: "env",
            workspaceKey: "ws",
            action: "action",
            fileName: "file",
            searchId: "search",
        };

        return Object.entries(map)
            .filter(([sourceKey]) => partialScope[sourceKey] !== undefined && partialScope[sourceKey] !== null)
            .map(([sourceKey, targetKey]) => `:${targetKey}=${this.#normalize(partialScope[sourceKey])}`);
    }

    #normalize(value) {
        return encodeURIComponent(String(value ?? "").toLowerCase());
    }
}

module.exports = CacheService;
