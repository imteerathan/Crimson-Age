# Crimson Atlas Horizon

Crimson Atlas Horizon is a Windows-first extension/companion for Crimson Atlas.

## Current milestone

Version 0.4.0 establishes the first live connection layer:

- Automatic Crimson Desert process detection (`CrimsonDesert.exe`)
- Automatic Crimson Atlas service detection (`CrimsonAtlasService.exe`) when present
- Local telemetry probing with `/v1/player`, `/player`, `/v1/status`, and `/health`
- Dashboard states: GAME_NOT_RUNNING, GAME_RUNNING, ATTACHING, CONNECTED, WAITING, NO_PROVIDER, ERROR/OFFLINE
- Live X/Y/Z display when a supported local telemetry provider returns a position
- Non-invasive always-on-top overlay
- Overlay global hotkey: Ctrl+Shift+H
- Manual hide/show override
- Atlas/Horizon state is separate from Save Analyzer
- Existing read-only save analysis is preserved

## Architecture

```text
Crimson Desert
    |
    +-- Crimson Atlas / Atlas Service
    |       |
    |       +-- game/process state
    |       +-- live telemetry
    |       +-- save-completion evidence
    |
    +-- Crimson Atlas Horizon
            |
            +-- connection state
            +-- live player state
            +-- completion/guidance layer
            +-- overlay
            +-- updater
```

Horizon treats live game state as the connection gate. Save analysis is evidence, not the connection mechanism.

## Build

`npm install`
`npm start`
`npm run build`

Windows artifacts are created in `dist/`.

## Update

The packaged application uses `electron-updater` with GitHub Releases.

The repository workflow builds Windows NSIS + portable artifacts and publishes a GitHub Release for the package version.

## Scope

Horizon does not modify the Crimson Desert installation or game save files.
