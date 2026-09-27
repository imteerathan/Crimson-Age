# Crimson Age Desktop

Windows-first Electron desktop companion for Crimson Age.

## Development workflow

1. Run `npm install`.
2. Run `npm start` during development.
3. Run `npm run build` for Windows NSIS + portable artifacts.
4. Launch the packaged executable from PowerShell for field testing.
5. Use the app's session log when packaged Electron output is not visible in the terminal.
6. Publish a Git tag such as `v0.3.2` to trigger the GitHub Actions Windows release.

## Update workflow

The packaged app includes an in-app **Check for Updates** control backed by `electron-updater`.

The intended production flow is:

`GitHub release -> Check for Updates -> Download -> Restart -> Install`

User data is stored under the Windows user profile and is not part of application update files:

- SQLite database
- Checklist state
- Save Baseline history
- Logs

Save analysis remains read-only. Crimson Age does not write back to the game's save file.

## Important release note

GitHub automatic updates require the release assets to be reachable by the packaged client. A private source repository needs an authenticated distribution path for end-user update downloads. The current repository is configured as the source/release project; before production rollout, use a public release endpoint or a separate public release repository rather than embedding a GitHub personal access token in the client.

## Current scope

- Electron desktop shell
- SQLite persistence
- Checklist persistence
- Save metadata + SHA-256 baseline
- Read-only PARC object correlation with safe primitive/enum/scalar-alias field-value previews and searchable change filtering
- Baseline history
- Local logging
- Windows NSIS + portable packaging
- In-app update check/download/install flow
- Placeholder map renderer only

Not yet claimed:
D1.8 extends value previews with an allowlisted set of scalar aliases (for example `TStat`, `TLevel`, and `TStackCount`). These are shown as unsigned storage-level interpretations only; they are not treated as full semantic type resolution.


- Real game map
- Semantic Save decoding
- Crimson Route integration
- Complete canonical database

## Versioning policy

D1.9 adds a local search/filter field to the Save Object Correlation view so changed classes, fields, types, and decoded values can be located without manually scanning the result list.

D1.10 clears previously rendered save comparisons and correlation search state whenever a new baseline is captured. This prevents an older comparison from being mistaken for the newly selected baseline pair.

The project uses **one version number only**, stored in `package.json`.

- Normal releases use SemVer: `X.Y.Z`.
- The same `X.Y.Z` value is used for the app, installer filename, Git tag, GitHub Release, and updater metadata.
- Patch releases advance sequentially, for example `0.3.19` -> `0.3.20`.
- There is no separate public version, updater version, base version, or hotfix suffix.

`electron-updater` reads the same application version from Electron/package metadata. This keeps the version shown to the user and the version used by the updater identical.
