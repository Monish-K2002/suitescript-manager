# SuiteScript Manager

A VS Code extension to speed up SuiteScript development by syncing files with NetSuite, comparing local vs remote code, previewing saved searches, and viewing recent script logs.

## Features

- Push current file to NetSuite (`patch` action)
- Pull file contents from current environment
- Pull file contents directly from production environment
- Compare local file with NetSuite version in a diff view
- Open current script/file directly in NetSuite
- Fetch and display recent script execution logs
- Get saved search list, preview rows, and copy boilerplate `search.load` code
- Built-in cache for search list, search previews, and script ID lookups
- Status bar indicator showing detected environment from folder structure
- Automatic local backup of remote content before push (when NetSuite returns `oldContent`)

## How It Works

The extension infers environment from your file path:

`<workspace>/<environment>/.../yourScript.js`

Example:

`my-project/sandbox/FileCabinet/SuiteScripts/foo.js` -> environment is `sandbox`

For actions that do not require an active editor (for example getting search list), you can select environment from a picker when multiple environments are configured.

## Prerequisites

- VS Code `^1.105.0`
- Node.js and npm (for local development)
- A NetSuite RESTlet/endpoint compatible with the actions used by this extension:
  - `patch`
  - `getScriptContents`
  - `getSearchList`
  - `previewSearch`
  - `getScriptId`
  - `fetchRecentLogs`
- NetSuite token-based auth credentials per environment

## Configuration

Create a `.ss-manager.json` file at the workspace root.

### Required schema

Each top-level key is an environment name (for example `sandbox`, `production`).

Every environment object must include:

- `CLIENT_ID`
- `CLIENT_SECRET`
- `ACCESS_TOKEN`
- `ACCESS_SECRET`
- `REALM`
- `URL`

### Example

```json
{
  "sandbox": {
    "CLIENT_ID": "your-client-id",
    "CLIENT_SECRET": "your-client-secret",
    "ACCESS_TOKEN": "your-access-token",
    "ACCESS_SECRET": "your-access-secret",
    "REALM": "1234567_SB1",
    "URL": "https://1234567-sb1.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=###&deploy=#"
  },
  "production": {
    "CLIENT_ID": "your-client-id",
    "CLIENT_SECRET": "your-client-secret",
    "ACCESS_TOKEN": "your-access-token",
    "ACCESS_SECRET": "your-access-secret",
    "REALM": "1234567",
    "URL": "https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=###&deploy=#"
  }
}
```

## Commands

Open Command Palette and run:

- `Suitescript-Manager: Push Code`
- `Suitescript-Manager: Compare Code`
- `Suitescript-Manager: Get Search List`
- `Suitescript-Manager: Pull From Production`
- `Suitescript-Manager: Pull From Current Environment`
- `Suitescript-Manager: Check Environment` (contributed in `package.json`)
- `Suitescript-Manager: Open in NetSuite`
- `Suitescript-Manager: Fetch Recent Logs`
- `Suitescript-Manager: Refresh Search Cache`
- `Suitescript-Manager: Clear Cache (Current Scope)`
- `Suitescript-Manager: Clear Cache (All)`

## Safety and Caching

- Pushing to an environment named `prod` or `production` requires confirmation.
- Cached data is scoped by account + environment + workspace.
- Default cache TTLs:
  - Search list: 6 hours
  - Search preview: 15 minutes
  - Script ID lookup: 24 hours

## Backups

On push, if NetSuite responds with `oldContent`, a backup is stored under:

`<workspace>/Backup/<relative-file-path>/<file>_<dd-mm-yyyy hh-mm>.<ext>`

## Development

### Install

```bash
npm install
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm test
```

### Run extension locally

1. Open this project in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. In the host window, open a workspace containing `.ss-manager.json` and your environment folders.

## Project Structure

- `extension.js`: activation and command registration
- `Handler.js`: command implementations
- `Context.js`: environment detection + config loading/validation
- `AuthService.js`: OAuth 1.0a header generation
- `Request.js`: axios wrapper with retry logic
- `CacheService.js`: globalState cache layer
- `Util/Utils.js`: backups, webviews, formatting helpers
- `media/`: webview assets

## Known Notes

- `suitescript-manager.check-environment` is contributed but not currently registered in `extension.js`.
- The extension assumes your folder layout uses environment as the first segment under workspace root.

## License

No license file is currently included in this repository.
