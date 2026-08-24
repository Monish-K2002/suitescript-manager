# SuiteScript Manager

[![VS Code](https://img.shields.io/badge/VS%20Code-^1.105.0-blue.svg)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0+-blue.svg)](https://www.typescriptlang.org/)
[![SuiteScript](https://img.shields.io/badge/SuiteScript-2.1-orange.svg)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/index.html)

**SuiteScript Manager** is a developer tool and Visual Studio Code extension designed to streamline NetSuite SuiteScript 2.x development. It provides seamless bidirectional code synchronization, real-time diffing, interactive saved search inspection, live execution log monitoring, and multi-environment management directly within VS Code.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Repository Structure](#architecture--repository-structure)
- [NetSuite Setup (RESTlet)](#netsuite-setup-restlet)
- [Configuration](#configuration)
  - [Folder Structure Convention](#folder-structure-convention)
  - [Environment Configuration (`.ss-manager.json`)](#environment-configuration-ss-managerjson)
  - [Interactive Configuration Wizard](#interactive-configuration-wizard)
- [Available Commands](#available-commands)
- [Detailed Feature Walkthrough](#detailed-feature-walkthrough)
  - [Code Push & Automatic Backups](#code-push--automatic-backups)
  - [Remote Diff Comparison](#remote-diff-comparison)
  - [Saved Search Explorer & Boilerplate Generator](#saved-search-explorer--boilerplate-generator)
  - [Live Script Execution Logs](#live-script-execution-logs)
  - [Smart Caching System](#smart-caching-system)
- [Development & Contribution](#development--contribution)
- [Security & Best Practices](#security--best-practices)

---

## Overview

Developing SuiteScripts often involves manual file cabinet uploads or cumbersome deployment cycles. SuiteScript Manager bridges your local VS Code workspace with multiple NetSuite environments (e.g., Sandbox, Release Preview, Production) using a lightweight NetSuite RESTlet and Token-Based Authentication (TBA / OAuth 1.0a).

---

## Key Features

- **🚀 Direct Code Push:** Upload the active script file directly to NetSuite's File Cabinet with base64 encoding.
- **📥 Code Pull:** Pull remote file contents from the current environment or directly from production.
- **🔍 Remote Diff Comparison:** Open a side-by-side VS Code diff view comparing local edits with the live remote file on NetSuite.
- **🛡️ Safety & Automatic Backups:**
  - Mandatory confirmation prompt when pushing to production environments (`prod` / `production`).
  - Automatic timestamped backups saved under `Backup/` when NetSuite returns the previous file content on push.
- **📊 Saved Search Explorer:**
  - Browse available saved searches across your NetSuite account.
  - Preview the first page of search results in an interactive webview table.
  - One-click copy for auto-generated `search.load` boilerplate SuiteScript code based on search columns.
- **📜 Live Script Execution Logs:** Fetch and stream recent script execution logs (`DEBUG`, `AUDIT`, `ERROR`, `EMERGENCY`) into a dedicated VS Code webview panel.
- **🌐 Open in NetSuite:** Deep-link directly to the Script record or File record in the NetSuite web interface from your active editor.
- **⚡ Smart Scoped Caching:** Caches search lists, previews, and script IDs in VS Code `globalState` (scoped by Account + Environment + Workspace) to minimize API latency.
- **🏷️ Environment Status Bar:** Real-time status bar indicator showing active workspace and detected environment, with visual color cues (warning/error) for production safety.

---

## Architecture & Repository Structure

The project consists of two core components:

```
suitescript-manager/
├── Restlet/
│   └── suitescript_manager_RL.js    # NetSuite SuiteScript 2.1 RESTlet script
└── suitescript-manager/              # VS Code Extension (TypeScript)
    ├── AuthService.ts                # OAuth 1.0a (HMAC-SHA256) signature generation
    ├── CacheService.ts               # Memento-based cache layer with TTL & scoping
    ├── ConfigService.ts              # JSON schema validation (Ajv) & config loader
    ├── Context.ts                    # Workspace/environment resolution & context builder
    ├── Handler.ts                    # Command handlers for all extension actions
    ├── Request.ts                    # Axios HTTP client with automatic retry logic
    ├── Util/
    │   └── Utils.ts                  # Backup manager, Webview panels, HTML formatters
    ├── media/
    │   └── logPanel.html             # HTML/CSS UI template for the Live Logs panel
    ├── test/
    │   └── extension.test.ts         # Extension test suite
    ├── extension.ts                  # Extension entry point & status bar provider
    ├── package.json                  # Extension manifest & command contributions
    ├── tsconfig.json                 # TypeScript compiler configuration
    └── eslint.config.mjs             # ESLint configuration
```

---

## NetSuite Setup (RESTlet)

To use SuiteScript Manager, deploy the companion RESTlet script to each target NetSuite environment:

### 1. Upload the RESTlet
1. In NetSuite, go to **Customization > Scripting > Scripts > New**.
2. Upload and select [`Restlet/suitescript_manager_RL.js`](Restlet/suitescript_manager_RL.js).
3. Click **Create Script Record**.
4. Set the script name (e.g., `SuiteScript Manager RESTlet`) and verify the handlers:
   - **GET Function:** `get`
   - **POST Function:** `post`
5. Save the Script Record and click **Deploy Script**.
6. Set the deployment status to **Released** and define the appropriate audience/roles.
7. Note down the **RESTlet External URL** (contains `script=...&deploy=...`).

### 2. Configure Token-Based Authentication (TBA)
1. **Enable Features:** Go to **Setup > Company > Enable Features > SuiteCloud > Manage Authentication** and ensure **Token-based Authentication** is enabled.
2. **Create Integration Record:**
   - Go to **Setup > Integration > Manage Integrations > New**.
   - Enable **Token-Based Authentication** and uncheck "TBA: Authorization Flow".
   - Save and record the `Consumer Key (CLIENT_ID)` and `Consumer Secret (CLIENT_SECRET)`.
3. **Create Access Tokens:**
   - Go to **Setup > Users/Roles > Access Tokens > New**.
   - Select your Application Name, User, and a Role with appropriate File Cabinet / Script permissions.
   - Save and record the `Token ID (ACCESS_TOKEN)` and `Token Secret (ACCESS_SECRET)`.

---

## Configuration

### Folder Structure Convention

SuiteScript Manager determines the target NetSuite environment dynamically from the relative file path within your workspace:

```
<workspace-root>/
├── sandbox/
│   └── SuiteScripts/
│       └── custom_script.js         --> Target environment: "sandbox"
├── production/
│   └── SuiteScripts/
│       └── custom_script.js         --> Target environment: "production"
├── Backup/                          --> Generated automatically for push backups
└── .ss-manager.json                 --> Workspace configuration file
```

> **Note:** The top-level folder inside your workspace root represents the environment key matching `.ss-manager.json`.

---

### Environment Configuration (`.ss-manager.json`)

Create a `.ss-manager.json` file in the root of your workspace:

```json
{
  "sandbox": {
    "CLIENT_ID": "your_consumer_key",
    "CLIENT_SECRET": "your_consumer_secret",
    "ACCESS_TOKEN": "your_token_id",
    "ACCESS_SECRET": "your_token_secret",
    "REALM": "1234567_SB1",
    "URL": "https://1234567-sb1.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1"
  },
  "production": {
    "CLIENT_ID": "your_consumer_key",
    "CLIENT_SECRET": "your_consumer_secret",
    "ACCESS_TOKEN": "your_token_id",
    "ACCESS_SECRET": "your_token_secret",
    "REALM": "1234567",
    "URL": "https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1"
  }
}
```

#### Field Specifications:
| Field | Type | Description |
| :--- | :--- | :--- |
| `CLIENT_ID` | String | Integration record Consumer Key |
| `CLIENT_SECRET` | String | Integration record Consumer Secret |
| `ACCESS_TOKEN` | String | User Token ID |
| `ACCESS_SECRET` | String | User Token Secret |
| `REALM` | String | NetSuite Account ID (e.g. `1234567` or `1234567_SB1`) |
| `URL` | String | Full external RESTlet deployment URL |

---

### Interactive Configuration Wizard

You can also configure environments interactively through VS Code without editing JSON manually:
1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **`Suitescript-Manager: Configure Environment`**.
3. Select an existing environment folder or enter a custom name.
4. Follow the input prompts to enter each credential field.

---

## Available Commands

Access all extension features via the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command Title | Identifier | Description |
| :--- | :--- | :--- |
| **Suitescript-Manager: Push Code** | `suitescript-manager.push-code` | Uploads active editor file to NetSuite and creates a local backup of old remote code. |
| **Suitescript-Manager: Compare Code** | `suitescript-manager.compare-code` | Opens a side-by-side diff comparing local file against the current remote file. |
| **Suitescript-Manager: Pull From Current Environment** | `suitescript-manager.pull-from-current-environment` | Overwrites active editor file with the remote copy from the current environment. |
| **Suitescript-Manager: Pull From Production** | `suitescript-manager.pull-from-production` | Overwrites active editor file with the remote copy from the production environment. |
| **Suitescript-Manager: Get Search List** | `suitescript-manager.get-search-list` | Lists saved searches, provides a data preview table, and generates boilerplate code. |
| **Suitescript-Manager: Refresh Search Cache** | `suitescript-manager.refresh-search-cache` | Clears and re-fetches cached saved search lists for the current scope. |
| **Suitescript-Manager: Fetch Recent Logs** | `suitescript-manager.fetch-recent-logs` | Opens the Live Logs panel and displays execution logs for the current script. |
| **Suitescript-Manager: Open in NetSuite** | `suitescript-manager.open-in-netsuite` | Opens the corresponding script or file cabinet record in your default web browser. |
| **Suitescript-Manager: Configure Environment** | `suitescript-manager.configure-environment` | Launches the interactive wizard to add or update environment credentials. |
| **Suitescript-Manager: Clear Cache (Current Scope)** | `suitescript-manager.clear-cache-current-scope` | Clears cached data for the active account/environment/workspace. |
| **Suitescript-Manager: Clear Cache (All)** | `suitescript-manager.clear-cache-all` | Purges all SuiteScript Manager caches across all environments. |

---

## Detailed Feature Walkthrough

### Code Push & Automatic Backups
When executing **Push Code**:
1. Environment detection verifies target account safety. If pushing to `prod` or `production`, an explicit confirmation prompt is displayed.
2. File content is encoded in Base64 and sent to the RESTlet.
3. If the file already exists on NetSuite, the RESTlet returns the previous remote version in `oldContent`.
4. A local backup is automatically created at:
   ```
   <workspace>/Backup/<path>/<filename>_<dd-mm-yyyy hh-mm>.<ext>
   ```
5. File caches for the active script are automatically invalidated.

### Remote Diff Comparison
When executing **Compare Code**:
1. The remote version is downloaded and decoded into a temporary virtual in-memory document.
2. VS Code opens a native diff editor titled:
   `Local -> Netsuite (<fileName>) || <environment>`
3. Allows reviewing local changes against the server before pushing.

### Saved Search Explorer & Boilerplate Generator
When executing **Get Search List**:
1. Retrieves available saved searches (cached for 6 hours).
2. Selecting a search fetches the first 50 rows (cached for 15 minutes).
3. Opens an HTML preview table displaying columns and rows.
4. Includes a **Copy Boilerplate** button that generates ready-to-use SuiteScript 2.x code:
   ```javascript
   const searchObj = search.load({ id: 'customsearch_my_search' });

   searchObj.run().each(result => {
     const internalid = result.getValue({ name: 'internalid' });
     const entityid = result.getValue({ name: 'entityid' });
     return true;
   });
   ```

### Live Script Execution Logs
When executing **Fetch Recent Logs**:
1. Queries the NetSuite `scriptexecutionlog` record associated with the active script's file ID.
2. Formats and renders up to 100 recent entries in a custom Webview panel.
3. Highlights log levels with standard severity color codes (`ERROR`, `WARN`, `DEBUG`).

### Smart Caching System
To optimize performance and minimize NetSuite governance consumption, requests are cached using `vscode.Memento` (global state):
- **Search Lists:** 6 hours TTL
- **Search Previews:** 15 minutes TTL
- **Script ID Lookups:** 30 days TTL
- **Scope Segmentation:** Cache keys incorporate `accountKey:environment:workspaceKey:action:fileName:searchId` to ensure total isolation between multi-account setups.

---

## Development & Contribution

### Prerequisites
- Node.js (v18.x or later recommended, engine supports Node 22.x)
- VS Code `^1.105.0`
- npm

### Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/Monish-K2002/suitescript-manager.git
   cd suitescript-manager/suitescript-manager
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build and compile:
   ```bash
   # Compile TypeScript
   npm run compile

   # Watch mode for automatic re-compilation
   npm run watch
   ```

4. Lint code:
   ```bash
   npm run lint
   ```

5. Run tests:
   ```bash
   npm test
   ```

6. Debug extension:
   - Open the `suitescript-manager` folder in VS Code.
   - Press `F5` to start a new **Extension Development Host** window.

---

## Security & Best Practices

- **Never commit `.ss-manager.json`:** Add `.ss-manager.json` to your `.gitignore` to prevent leaking NetSuite API tokens and consumer secrets.
- **Ignore Local Backups:** Add `Backup/` to `.gitignore` if you do not wish to track backup snapshots in source control.
- **Recommended `.gitignore` snippet:**
  ```gitignore
  # SuiteScript Manager credentials & backups
  .ss-manager.json
  Backup/
  ```
- **Principle of Least Privilege:** When creating NetSuite TBA tokens, assign roles with only the necessary permissions required for SuiteScript file cabinet operations and search execution.

---

## License

This project is maintained for SuiteScript development workflows. Refer to repository details for specific licensing terms.
