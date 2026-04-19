import type * as vscode from "vscode";

export interface NetSuiteEnvironmentConfig {
    CLIENT_ID: string;
    CLIENT_SECRET: string;
    ACCESS_TOKEN: string;
    ACCESS_SECRET: string;
    REALM: string;
    URL: string;
}

export type NetSuiteConfig = Record<string, NetSuiteEnvironmentConfig>;

export type RequestMethod = "GET" | "POST";

export interface RequestParams {
    method: RequestMethod;
    fileName?: string;
    action?: string;
    searchId?: string;
    message?: string;
}

export interface AuthHeadersResult {
    url: string;
    body: Record<string, string>;
    headers: Record<string, string>;
}

export interface AuthProvider {
    getHeaders(params: RequestParams): AuthHeadersResult;
}

export interface ExtensionContextData {
    editor?: vscode.TextEditor;
    filePath?: string;
    fileName: string;
    environment: string;
    config: NetSuiteConfig;
    auth: AuthProvider | null;
    envIndex: number;
    parts: string[];
}

export interface SearchListItem {
    id: string;
    title: string;
    recordType: string;
}

export interface PreviewSearchColumn {
    name: string;
    label: string;
    join?: string;
    summary?: string;
    formula?: string;
}

export type PreviewSearchRow = Record<string, unknown>;

export interface PreviewSearchResponse {
    searchId: string;
    columns: PreviewSearchColumn[];
    rows: PreviewSearchRow[];
}

export interface RawLogEntry {
    type?: string;
    date?: string;
    time?: string;
    user?: string;
    scriptType?: string;
    details?: unknown;
}

export interface FetchRecentLogsResponse {
    logs: RawLogEntry[];
}

export interface FormattedLogEntry {
    type: string;
    date: string;
    user: string;
    scriptType: string;
    message: string;
}

export interface CacheScope {
    accountKey?: string;
    environment?: string;
    workspaceKey?: string;
    action?: string;
    fileName?: string;
    searchId?: string;
}

export interface CacheEntry<T> {
    value: T;
    createdAt: number;
    expiresAt: number | null;
}

export type SyncStatus = "in-sync" | "dirty" | "unknown";

export interface SyncEnvironmentNode {
    type: "env";
    label: string;
    configured: boolean;
}

export interface SyncFileNode {
    type: "file";
    label: string;
    resourceUri: vscode.Uri;
    envName: string;
    status: SyncStatus;
}

export type SyncTreeNode = SyncEnvironmentNode | SyncFileNode;
