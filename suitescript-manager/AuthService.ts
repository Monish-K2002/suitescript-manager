import * as crypto from "node:crypto";

import OAuth from "oauth-1.0a";

import type {
    AuthHeadersResult,
    NetSuiteEnvironmentConfig,
    RequestParams,
} from "./types";

export class AuthService {
    private readonly config: NetSuiteEnvironmentConfig;

    private readonly oauth: OAuth;

    public constructor(config: NetSuiteEnvironmentConfig) {
        this.config = config;
        this.oauth = new OAuth({
            consumer: {
                key: this.config.CLIENT_ID,
                secret: this.config.CLIENT_SECRET,
            },
            signature_method: "HMAC-SHA256",
            hash_function: (baseString, key) => crypto
                .createHmac("sha256", key)
                .update(baseString)
                .digest("base64"),
        });
    }

    // Builds the signed request shape expected by the NetSuite RESTlet for both reads and writes.
    public getHeaders(params: RequestParams): AuthHeadersResult {
        const url = this.config.URL;
        const requestData: {
            url: string;
            method: RequestParams["method"];
            data?: Record<string, string>;
        } = {
            url,
            method: params.method,
        };

        if (params.method === "GET") {
            requestData.data = {};

            if (params.fileName) {
                requestData.data.fileName = params.fileName;
            }
            if (params.action) {
                requestData.data.action = params.action;
            }
            if (params.searchId) {
                requestData.data.searchId = params.searchId;
            }
        }

        const body: Record<string, string> = {};
        if (params.method === "POST") {
            body.action = "patch";
            body.message = params.message ?? "";
            body.fileName = params.fileName ?? "";
        }

        return {
            url,
            body,
            headers: {
                Authorization:
                    this.oauth.toHeader(
                        this.oauth.authorize(requestData, {
                            key: this.config.ACCESS_TOKEN,
                            secret: this.config.ACCESS_SECRET,
                        }),
                    ).Authorization + `, realm="${this.config.REALM}"`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        };
    }
}
