# HOR1ZON Architecture

## 1. Target architecture

```text
                    ┌─────────────────────────────┐
                    │       Crimson Atlas Host     │
                    │  lifecycle · window · host  │
                    └──────────────┬──────────────┘
                                   │
                          Host Extension API
                                   │
                    ┌──────────────▼──────────────┐
                    │       Horizon Extension      │
                    │   manifest · capabilities    │
                    ├──────────────────────────────┤
                    │        Horizon Shell         │
                    │   settings · window · tray   │
                    ├──────────────────────────────┤
                    │        Horizon Core          │
                    │ state · events · contracts   │
                    ├──────────────┬───────────────┤
                    │              │
          ┌─────────▼──────┐ ┌─────▼──────────────┐
          │ Horizon        │ │ Horizon Game/Host  │
          │ Services       │ │ Adapters            │
          │ updater        │ │ Atlas bridge        │
          │ storage        │ │ Route/telemetry     │
          │ diagnostics    │ │ save adapter        │
          └─────────┬──────┘ └─────┬──────────────┘
                    │              │
                    └──────┬───────┘
                           │
                    ┌──────▼──────────────┐
                    │       UI Modules     │
                    │ dashboard/map/etc.   │
                    └───────────────────────┘
```

## 2. Process boundaries

### Host

Atlas owns the host lifecycle.

It may provide:

- host version;
- extension lifecycle;
- game-session lifecycle;
- optional window/overlay surface;
- host identity;
- supported capabilities.

### Horizon

Horizon owns:

- extension state;
- Horizon settings;
- Horizon update lifecycle;
- local cache;
- player-facing extension state;
- adapters;
- diagnostic logs;
- extension UI;
- overlay behavior.

### Game

The game remains an external system.

Horizon never silently assumes that a signal exists.

Every live integration is represented as an adapter with:

- adapter id;
- adapter version;
- source;
- confidence;
- freshness;
- compatibility status.

## 3. Extension manifest

Proposed manifest shape:

```json
{
  "id": "crimson.horizon",
  "name": "Horizon Extension",
  "version": "0.1.0",
  "host": {
    "name": "Crimson Atlas",
    "minVersion": "1.0.0"
  },
  "capabilities": [
    "settings",
    "updater",
    "playbook",
    "checklist",
    "map",
    "overlay",
    "telemetry"
  ],
  "permissions": {
    "filesystem": "limited",
    "gameSaveRead": true,
    "gameSaveWrite": false,
    "network": "updater-only"
  },
  "entry": {
    "renderer": "dist/renderer/index.html",
    "service": "dist/service/index.js"
  }
}
```

The exact schema is provisional until the Atlas host loader contract is verified.

## 4. Capability negotiation

Horizon should never infer capability support from host version alone.

Use:

`manifest -> host capabilities -> negotiated capabilities`

Example:

```text
HOST_CAPABILITIES
  overlay.v1
  ipc.v1
  telemetry.v1

HORIZON_REQUESTS
  overlay.v1
  telemetry.v1
  map.v1

NEGOTIATED
  overlay.v1
  telemetry.v1

FALLBACK
  map.v1 = local-only
```

Unknown capabilities must fail closed.

## 5. Event model

Proposed event envelope:

```json
{
  "event": "host.session.changed",
  "version": 1,
  "timestamp": "2026-09-28T00:00:00.000Z",
  "source": "atlas",
  "sessionId": "local-session-id",
  "payload": {}
}
```

Minimum event families:

- host lifecycle;
- game lifecycle;
- player state;
- route/navigation;
- overlay lifecycle;
- updater lifecycle;
- settings changes;
- diagnostics.

## 6. Host bridge

Suggested bridge operations:

```text
host:getInfo
host:getCapabilities
host:subscribe
host:unsubscribe
host:openSettings
host:getSession
host:getGameState
host:getTelemetry
host:getOverlaySurface
```

Adapter implementations should translate host-specific details into Horizon contracts.

Horizon UI must not call host-specific APIs directly.

## 7. Settings

Settings is a first-class Horizon module.

Recommended sections:

### General

- launch behavior;
- language;
- appearance;
- compact mode;
- notification behavior.

### Overlay

- enabled/disabled;
- full/compact/focus mode;
- opacity;
- position;
- manual hide;
- automatic hide;
- restore behavior.

### Integration

- Atlas connection;
- adapter selection;
- telemetry permission;
- reconnect policy.

### Updates

- current Horizon version;
- update channel;
- check now;
- download now;
- install/restart;
- release notes;
- last check;
- last successful update;
- rollback/recovery status.

### Data

- database location;
- export diagnostics;
- import data;
- clear cache;
- reset extension state.

### Privacy

- telemetry status;
- diagnostics retention;
- network endpoints;
- data processing summary.

## 8. Horizon self-updater

The updater must be independent from ordinary feature services.

State machine:

```text
IDLE
  │
  ├─> CHECKING
  │      ├─> UP_TO_DATE
  │      ├─> AVAILABLE
  │      └─> ERROR
  │
  └─> AVAILABLE
          │
          └─> DOWNLOADING
                   ├─> READY
                   └─> ERROR
                          │
READY ──> INSTALLING ──> RESTARTING ──> UPDATED
                           │
                           └──────────> RECOVERY
```

Updater requirements:

- never replace the running executable in-place;
- preserve user data across upgrades;
- verify release metadata and package integrity;
- keep the previous known-good build available when technically feasible;
- surface errors in Settings;
- support unattended compatibility checks without forcing installation;
- never require a GitHub credential embedded in the client.

For hosted mode, the same updater service must be able to update only Horizon while Atlas remains untouched.

## 9. Storage

Proposed database layers:

```text
horizon_meta
extension_settings
extension_state
player_state
adapter_state
update_history
diagnostic_events
migration_history
```

The storage service should expose transactions and versioned migrations.

Never place migration logic inside UI handlers.

## 10. Overlay runtime

The overlay is a presentation surface, not a game-logic engine.

Required states:

```text
HIDDEN
FULL
COMPACT
FOCUS
CUTSCENE_HIDDEN
RESTORE_PENDING
```

Rules inherited from the baseline design:

- must not cover critical gameplay/HUD areas;
- manual hide is authoritative;
- cutscene/dialogue transitions can trigger automatic hide;
- automatic restore occurs only after stable gameplay is confirmed;
- overlay has no authority to change canonical game data.

## 11. Save adapter

The current read-only save analyzer becomes a service:

```text
SaveSource
   ↓
SnapshotService
   ↓
FormatDetector
   ↓
ContainerDecoder
   ↓
SchemaInspector
   ↓
DiffEngine
   ↓
CorrelationEngine
   ↓
EvidenceStore
```

Every decoded value must carry a provenance class:

```text
CONFIRMED
STRUCTURAL
STORAGE_ALIAS
HEURISTIC
UNKNOWN
```

Only `CONFIRMED` values may be promoted into authoritative canonical state.

This formalizes the safety posture already present in the Crimson baseline.

## 12. UI module boundaries

Instead of one renderer `render()`, Horizon should use modules:

```text
ui/
  shell/
  dashboard/
  settings/
  updater/
  playbook/
  checklist/
  map/
  overlay/
  diagnostics/
  save-analyzer/
  connection/
```

Each module gets:

- state selector;
- actions;
- view;
- error boundary;
- capability guard.

## 13. Proposed project tree

```text
horizon/
  package.json
  manifest.json
  README.md

  src/
    main/
      index.js
      lifecycle.js

    preload/
      index.js
      bridge.js

    core/
      contracts/
      events/
      capabilities/
      state/

    services/
      updater/
      storage/
      diagnostics/
      settings/
      migration/

    adapters/
      atlas/
      route/
      telemetry/
      save/

    overlay/
      runtime/
      policy/

    renderer/
      shell/
      dashboard/
      settings/
      updater/
      playbook/
      checklist/
      map/
      diagnostics/

  data/
    migrations/

  tests/
    contracts/
    services/
    adapters/
    overlay/
    updater/
```

## 14. Migration strategy

Horizon should not rewrite everything at once.

### Stage H0

Extract contracts only.

### Stage H1

Move updater and settings into isolated services.

### Stage H2

Move persistence and diagnostics.

### Stage H3

Introduce Atlas bridge + capability negotiation.

### Stage H4

Move save analysis behind a Save Adapter.

### Stage H5

Introduce overlay runtime.

### Stage H6

Replace the legacy renderer with module-based UI.

### Stage H7

Enable hosted Crimson Atlas mode and standalone fallback.

## 15. First implementation slice

The first real Horizon implementation should be intentionally small:

1. extension manifest;
2. host handshake;
3. Horizon Settings;
4. Horizon updater service;
5. updater status page;
6. persistent settings storage;
7. connection diagnostic page;
8. standalone fallback shell.

This slice creates the architectural spine before any heavy game-specific integration is moved over.

## 16. Exit condition for the foundation phase

Foundation is complete when:

- Horizon can start independently;
- Horizon can load as an Atlas extension through a versioned contract;
- Settings are persisted;
- Horizon can check/download/install its own update;
- host capability negotiation works;
- host absence falls back cleanly;
- updater state survives renderer reloads;
- no feature module directly reaches into host internals;
- automated contract tests cover the handshake and updater state machine.
