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
- Baseline history
- Local logging
- Windows NSIS + portable packaging
- In-app update check/download/install flow
- Placeholder map renderer only

Not yet claimed:

- Real game map
- Semantic Save decoding
- Crimson Route integration
- Complete canonical database

## Versioning policy

The **public version** is the user-facing Crimson Age version:

- `v.X.Y.Z` for normal builds.
- `v.X.Y.Z.N` for hotfix N on the base version.

For the project roadmap, X is the Major Update generation (0 = test, 1 = Full Release, 2 = Full Upgrade 1, 3 = Full Upgrade 2, and so on). Y is the Minor Update number (0-9999). Z is the Patch number.

The updater engine uses a separate three-part SemVer value because electron-updater validates the application version as SemVer. This technical value is not the public version shown to users. The mapping is stored in `versioning.json`.

The current build after the D1.6 hotfix cycle uses public version `v0.3.15.2` with updater build `0.3.17`.
