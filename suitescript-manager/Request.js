const vscode = require("vscode");
const axios = require("axios");

async function request(auth, method, params = {}) {
    try {
        const { url, headers, body } = auth.getHeaders({ ...params, method });
        // const config = { headers };
        
        let response;
        if (method === "GET") {
            response = await axios.get(url, { params: params, headers });
        } else {
            response = await axios.post(url, body, { headers });
        }

        if (response.data.status === "error") {
            const errorMessage = response.data.message || "NetSuite returned an error"
            throw new Error(`NetSuite API Error: ${errorMessage}`);
        }
        return response.data;
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        throw new Error(`NetSuite API Error: ${msg}`);
    }
}

module.exports = {
    request
}