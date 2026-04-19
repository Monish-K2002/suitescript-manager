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
exports.AuthService = void 0;
const crypto = __importStar(require("node:crypto"));
const oauth_1_0a_1 = __importDefault(require("oauth-1.0a"));
class AuthService {
    config;
    oauth;
    constructor(config) {
        this.config = config;
        this.oauth = new oauth_1_0a_1.default({
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
    getHeaders(params) {
        const url = this.config.URL;
        const requestData = {
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
        const body = {};
        if (params.method === "POST") {
            body.action = "patch";
            body.message = params.message ?? "";
            body.fileName = params.fileName ?? "";
        }
        return {
            url,
            body,
            headers: {
                Authorization: this.oauth.toHeader(this.oauth.authorize(requestData, {
                    key: this.config.ACCESS_TOKEN,
                    secret: this.config.ACCESS_SECRET,
                })).Authorization + `, realm="${this.config.REALM}"`,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        };
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map