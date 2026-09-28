# HOR1ZON Project

## Purpose

HOR1ZON is the next-generation **Horizon Extension** designed from the reverse-engineered architecture of the current Crimson Age / Atlas baseline.

The project goal is not to copy the existing implementation line-for-line. It is to preserve proven behavior while turning the current monolithic desktop companion into a modular extension architecture that can:

- run as an extension inside Crimson Atlas;
- run independently when the host is unavailable;
- keep persistent player data safe;
- provide a first-class self-updater;
- consume optional realtime/game integration through versioned adapters;
- keep the gameplay overlay contextual, non-intrusive, and reversible.

## Baseline

The reverse-engineering baseline is the current `main` branch of `imteerathan/Crimson-Age`.

At the time of this foundation work:

- HEAD: `012ffce`
- Application package version: `0.3.24`
- Runtime: Electron
- Persistence: SQLite via better-sqlite3
- Update system: electron-updater + GitHub Releases
- Renderer: browser UI with a preload bridge
- Save handling: read-only baseline snapshots, structural analysis, container decode, raw diff, object correlation and diagnostic export

The user-facing project name may later be presented as **Crimson Atlas Horizon** when the extension is hosted by Atlas. The codebase remains the neutral `Horizon Extension` project.

## Core principle

**Atlas owns the host. Horizon owns extension behavior.**

Horizon must not make the host, game logic, or save file the source of truth for extension state unless a versioned contract explicitly says so.

## Foundation status

- [x] Crimson baseline located
- [x] Runtime architecture reverse-engineered
- [x] IPC surface inventory captured
- [x] Persistence and updater behavior captured
- [x] Main architectural weaknesses identified
- [x] Horizon target architecture drafted
- [ ] Host extension loader contract implemented
- [ ] Horizon process/service split implemented
- [x] Horizon Settings + self-updater foundation implemented
- [x] Extension manifest/capability negotiation implemented
- [x] Atlas bridge adapter contract implemented
- [x] Overlay runtime implemented
- [x] Migration/upgrade validation foundation implemented
- [x] Windows NSIS + portable packaging path implemented

## Working rule

From this point forward, Horizon changes should be additive and modular. The existing Crimson baseline remains the compatibility reference, not the place where new Horizon architecture is entangled.
