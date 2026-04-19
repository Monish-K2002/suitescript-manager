import axios, { type AxiosError } from "axios";

import type { AuthProvider, RequestMethod, RequestParams } from "./types";

interface ApiResponse {
    status?: string;
    message?: string;
}

const http = axios.create({
    timeout: 15000,
});

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

function shouldRetry(error: unknown): boolean {
    const axiosError = error as AxiosError | undefined;
    const status = axiosError?.response?.status;
    if (status && RETRYABLE_STATUS.has(status)) {
        return true;
    }

    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    return [
        "ECONNABORTED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
    ].includes(errorCode ?? "");
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as { message?: string } | undefined;
        return responseData?.message ?? error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export async function request<T>(
    auth: AuthProvider,
    method: RequestMethod,
    params: Omit<RequestParams, "method"> = {},
): Promise<T> {
    const { url, headers, body } = auth.getHeaders({ ...params, method });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            const response = method === "GET"
                ? await http.get<T>(url, { params, headers })
                : await http.post<T>(url, body, { headers });
            const data = response.data as T & ApiResponse;

            if (data.status === "error") {
                throw new Error(`NetSuite API error: ${data.message ?? "NetSuite returned an error"}`);
            }

            return response.data;
        } catch (error) {
            if (attempt < MAX_RETRIES && shouldRetry(error)) {
                await sleep(200 * (attempt + 1));
                continue;
            }

            throw new Error(`NetSuite API error: ${getErrorMessage(error)}`);
        }
    }

    throw new Error("NetSuite API error: request exhausted retries");
}
