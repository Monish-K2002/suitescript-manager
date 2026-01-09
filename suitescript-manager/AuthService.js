const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

class AuthService {
    constructor(config) {
        this.config = config;

        this.oauth = new OAuth({
            consumer: {
                key: this.config.CLIENT_ID,
                secret: this.config.CLIENT_SECRET,
            },
            signature_method: "HMAC-SHA256",
            hash_function: (base_string, key) =>
                crypto
                    .createHmac("sha256", key)
                    .update(base_string)
                    .digest("base64"),
        });
    }

    getHeaders(params) {
        const url = this.config.URL;
        // Request data
        const requestData = {
            url,
            method: params.method,
        };
        if (params.method == "GET") {
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

        if (params.method == "POST") {
            body.action = "patch";
            body.message = params.message;
            body.fileName = params.fileName;
        }

        const headers = {
            Authorization:
                this.oauth.toHeader(
                    this.oauth.authorize(requestData, {
                        key: this.config.ACCESS_TOKEN,
                        secret: this.config.ACCESS_SECRET,
                    }),
                ).Authorization + `, realm="${this.config.REALM}"`,
            "Content-Type": "application/json",
            Accept: "application/json",
        };

        return {
            url,
            body,
            headers,
        };
    }
}

module.exports = {
    AuthService
}
