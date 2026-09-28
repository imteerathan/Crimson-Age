# Reverse Engineering: Crimson Atlas Baseline

## 1. Important naming note

No repository literally named `Crimson Atlas` was found in the connected GitHub account. The accessible implementation corresponding to the current Crimson Age desktop companion is:

`imteerathan/Crimson-Age`

HOR1ZON therefore treats that implementation as the **Atlas baseline** for architecture reverse-engineering.

This distinction is recorded deliberately so that an inferred name is never mistaken for a verified repository or product identifier.

## 2. Runtime composition

### Main process

The current implementation places most application responsibilities in one file:

`src/main.js`

The file is approximately 52 KB and currently contains:

- Electron window construction;
- local logging;
- SQLite initialization and migration;
- player-state persistence;
- save-file picking;
- immutable save baseline snapshots;
- raw binary comparison;
- SAVE container decoding;
- ChaCha20/XOR and HMAC-related handling;
- LZ4 block decompression;
- PARC schema and TOC parsing;
- safe primitive/scalar-alias field previews;
- PARC object correlation;
- field-test JSON export;
- updater configuration and updater lifecycle;
- IPC handlers.

### Preload

`src/preload.js` exposes a deliberately narrow browser bridge through `contextBridge`.

Current bridge groups:

- state: `getState`, `setState`
- database: `dbInfo`
- save: `pickSave`, `listBaselines`, `compareSaves`, `compareDecodedSaves`, `analyzeSaveStructure`, `analyzeSaveContainer`, `exportFieldTestData`
- updater: `updaterStatus`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, `onUpdaterState`
- utility: `open:path`

### Renderer

`public/app.js` is also a single-file application.

It currently carries:

- UI navigation;
- global renderer state;
- persistence calls;
- updater interaction;
- dashboard;
- playbook;
- placeholder map;
- checklist;
- save analyzer;
- database view;
- field-test rendering.

`public/style.css` supplies the UI shell and a responsive breakpoint.

## 3. Persistence model

The application stores user data under Electron's per-user data directory.

The SQLite schema currently contains:

- `meta`
- `player_state`
- `ca_record`
- `save_baseline`

The save baseline flow is particularly important:

1. choose a game save;
2. collect file metadata and SHA-256;
3. copy the original into an immutable baseline snapshot;
4. store the snapshot path in SQLite;
5. use snapshots for later comparisons.

This is a good safety boundary for Horizon and should be retained.

## 4. Update model

The current updater uses `electron-updater` with:

- manual update checking;
- automatic download disabled;
- automatic install on app quit;
- downgrade protection enabled;
- GitHub as the release provider;
- explicit download step;
- restart-and-install step.

Observed updater states include:

`IDLE -> CHECKING -> UPDATE_AVAILABLE -> DOWNLOADING -> READY_TO_INSTALL`

with `UP_TO_DATE` and `ERROR` branches.

Recent field-test logs also demonstrate completed download/install cycles across sequential releases. The update subsystem is therefore not merely a mock: it is part of the working packaged-app path.

## 5. Release pipeline

The current release workflow builds Windows packages on pushes to `main`.

The pipeline:

1. checks out the repository;
2. installs Node 22 dependencies;
3. reads the version from `package.json`;
4. builds Windows packages;
5. generates `latest.yml`;
6. verifies installer, blockmap and updater metadata;
7. creates a GitHub release and uploads the artifacts.

The current package configuration produces:

- NSIS installer;
- portable Windows build;
- `latest.yml`;
- blockmap.

## 6. Save-analysis pipeline

The save subsystem is intentionally read-only.

The implementation recognizes a SAVE container and a raw PARC payload. The current diagnostic pipeline performs:

`SAVE -> decrypt -> decompress -> parse schema -> parse TOC -> inspect fields -> compare snapshots`

The code contains explicit safety language around unresolved semantics:

- raw byte differences are treated as observations;
- heuristic pointer/length candidates are not treated as confirmed schema;
- scalar aliases are storage-level interpretations;
- unsupported/custom/nested types remain diagnostic.

That safety posture should become a formal Horizon capability boundary rather than remain comments inside a large file.

## 7. Architecture weaknesses identified

### A. Main-process monolith

The highest structural debt is that unrelated responsibilities live in `src/main.js`.

This creates three risks:

- changes in one subsystem can affect another;
- feature testing requires booting the whole application;
- a future extension host cannot selectively load or unload capabilities.

### B. Renderer monolith

The browser UI is built around one `render()` function and string-template HTML.

It is efficient for a field-test prototype but becomes fragile once Horizon adds:

- Settings;
- extension registry;
- overlay lifecycle;
- host connection state;
- updater diagnostics;
- multiple adapters;
- permission/capability prompts.

### C. IPC names are application-specific rather than contract-based

The current bridge is practical, but its channels are tightly coupled to the Crimson Age implementation.

Horizon needs a versioned bridge namespace such as:

`horizon:* / atlas:* / host:*`

so that compatibility can be negotiated instead of inferred.

### D. No extension manifest

The current application is a fixed executable rather than a discoverable extension package.

Horizon needs a manifest declaring:

- extension id;
- version;
- host compatibility;
- capabilities;
- permissions;
- updater channel;
- entry points;
- optional adapters.

### E. Updater is embedded rather than modular

The current updater is functional but tied to application startup and a single package identity.

Horizon should expose updater state as a service, while the Settings UI consumes that service.

### F. No explicit host lifecycle

There is no formal concept of:

`DISCOVER -> CONNECT -> NEGOTIATE -> RUN -> DISCONNECT -> FALLBACK`

That lifecycle should become a first-class Horizon state machine.

## 8. What Horizon should preserve

The following behavior is considered a compatibility baseline:

- Chromium/Electron isolation using preload + context isolation;
- local persistence outside the application bundle;
- immutable save snapshots;
- read-only save handling;
- explicit updater states;
- packaged Windows distribution;
- diagnostic exports;
- failure-tolerant fallback behavior;
- clear distinction between known facts and heuristic observations.

## 9. What Horizon should change

Horizon should introduce:

- modular services;
- typed/versioned contracts;
- extension manifest;
- host adapter boundary;
- dedicated updater service;
- dedicated settings service/UI;
- overlay runtime;
- capability negotiation;
- host connection diagnostics;
- migration manager;
- structured event bus;
- testable domain modules;
- versioned persistence migrations.

## 10. Reverse-engineering conclusion

The existing implementation already contains the most valuable ingredients of Horizon, especially the updater, persistence safety, read-only save analysis, and renderer/main isolation.

The correct next step is not to add more features into the existing monolith. The correct next step is to extract its stable contracts and rebuild those contracts behind Horizon's modular boundaries.
