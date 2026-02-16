const axios = require("axios");

const http = axios.create({
    timeout: 15000,
});

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

function shouldRetry(error) {
    const status = error?.response?.status;
    if (status && RETRYABLE_STATUS.has(status)) {
        return true;
    }

    return [
        "ECONNABORTED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
    ].includes(error?.code);
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(auth, method, params = {}) {
    const { url, headers, body } = auth.getHeaders({ ...params, method });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            let response;
            if (method === "GET") {
                response = await http.get(url, { params, headers });
            } else {
                response = await http.post(url, body, { headers });
            }

            if (response.data.status === "error") {
                const errorMessage = response.data.message || "NetSuite returned an error";
                throw new Error(`NetSuite API Error: ${errorMessage}`);
            }
            return response.data;
        } catch (error) {
            if (attempt < MAX_RETRIES && shouldRetry(error)) {
                await sleep(200 * (attempt + 1));
                continue;
            }

            const msg = error.response?.data?.message || error.message;
            throw new Error(`NetSuite API Error: ${msg}`);
        }
    }
}

module.exports = {
    request
}
