"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
const axios_1 = __importDefault(require("axios"));
const http = axios_1.default.create({
    timeout: 15000,
});
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
// Retries only for transient HTTP and network failures that are likely to succeed on a second attempt.
function shouldRetry(error) {
    const axiosError = error;
    const status = axiosError?.response?.status;
    if (status && RETRYABLE_STATUS.has(status)) {
        return true;
    }
    const errorCode = error?.code;
    return [
        "ECONNABORTED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
    ].includes(errorCode ?? "");
}
// Small delay helper used for request backoff.
async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
// Normalizes different thrown error shapes into one user-facing message.
function getErrorMessage(error) {
    if (axios_1.default.isAxiosError(error)) {
        const responseData = error.response?.data;
        return responseData?.message ?? error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
// Sends a signed NetSuite request and wraps retry/error handling in one place for the extension.
async function request(auth, method, params = {}) {
    const { url, headers, body } = auth.getHeaders({ ...params, method });
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            const response = method === "GET"
                ? await http.get(url, { params, headers })
                : await http.post(url, body, { headers });
            const data = response.data;
            if (data.status === "error") {
                throw new Error(`NetSuite API error: ${data.message ?? "NetSuite returned an error"}`);
            }
            return response.data;
        }
        catch (error) {
            if (attempt < MAX_RETRIES && shouldRetry(error)) {
                await sleep(200 * (attempt + 1));
                continue;
            }
            throw new Error(`NetSuite API error: ${getErrorMessage(error)}`);
        }
    }
    throw new Error("NetSuite API error: request exhausted retries");
}
//# sourceMappingURL=Request.js.map