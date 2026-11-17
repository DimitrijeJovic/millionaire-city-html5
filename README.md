# Millionaire City HTML5

An educational fan-made restoration and reimplementation of *Millionaire City*, a discontinued Flash city-building game originally developed by Digital Chocolate. I explored it through reverse engineering, debugging, bug fixing, and testing, and then migrated it to **TypeScript** and **Phaser 3**. Original game assets and intellectual property belong to their respective rights holders.

### How this project came about

1. I found a community project on GitHub ([wman810/millionaire-city-rebuilt](https://github.com/wman810/millionaire-city-rebuilt)) that lets the original Flash client run again, downloaded it, and played the game.
2. To understand how the game worked, I studied its behaviour and resources: I wrote tools that read the original SWF files and analysed the client's ActionScript bytecode read-only (`tools/swfkit`, `docs/engine_facts.md`).
3. I investigated and fixed bugs and tested changes. Because optimising the Flash version further was limited, I moved to a new engine.
4. This repository is that reimplementation: the game rules, rendering, user interface, save system, and desktop shell are new TypeScript code on Phaser 3 (AI-assisted), verified by automated tests.

**What is mine and what is not:** the TypeScript code (`src/`), tests (`tests/`), conversion tools (`tools/`), desktop shell (`desktop/`), and documentation are my work. The original game, its code, graphics, sounds, text, and balance data are not; the game assets are **not included in this repository**; each user generates them locally in `public/assets/` from original game files they supply themselves. See [ASSET_ATTRIBUTION.md](ASSET_ATTRIBUTION.md), including what is and is not known about where those files came from.

> [!NOTE]
> **Development Status: v0.9.0 (Phase 9 Milestone)**  
> This release represents an active development milestone, not a 100% feature-complete game. Core economy cycles, construction, contract signing, shop purchases, map geometry, NPC visits, offline missions, and traffic simulation are playable.

> [!IMPORTANT]
> **Game assets are not included.** This repository contains the technical reconstruction (code, tools, tests, documentation), not the original game's graphics, sounds, text, or rules data. A fresh clone does not run until you generate the assets from your own legally obtained original game files; see [Preparing the Game Assets](#preparing-the-game-assets). This is an educational fan-made project and is not affiliated with or endorsed by the original rights holders.

---

## Table of Contents

- [Overview & Architecture](#overview--architecture)
- [Implemented Systems](#implemented-systems)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites & Installation](#prerequisites--installation)
- [Preparing the Game Assets](#preparing-the-game-assets)
- [Running the Game](#running-the-game)
- [Automated Testing & Verification](#automated-testing--verification)
- [Building the Desktop Application](#building-the-desktop-application)
- [Asset Reconstruction Pipeline](#asset-reconstruction-pipeline)
- [Known Limitations](#known-limitations)
- [Provenance & Third-Party Notices](#provenance--third-party-notices)

---

## Overview & Architecture

Unlike the community rebuild it started from, which runs the original Flash client, this project is a native HTML5 reimplementation:
- **Clean separation of concerns:** The simulation logic (`src/game/`) is strictly decoupled from the rendering pipeline (`src/scenes/`) and user interface (`src/ui/`).
- **Deterministic fixed-step simulation:** Game economy and timers tick on a deterministic fixed 40 ms step (matching the original game logic cadence), while rendering runs at the monitor's native refresh rate.
- **Pure-logic testability:** Because the simulation layer has no DOM or WebGL dependencies, the entire game state, economics, expansions, traffic, and mission progression are verified via Node.js unit tests.

---

## Implemented Systems

### Core Gameplay & Simulation
- **Isometric Grid & Terrain:** 90 × 60 tile world map (36 expansion areas of 15 × 10 tiles), 47-form autotiling engine matching original bitmasks, and crosswalk placement at junctions.
- **Construction & Placement:** Placement rules, footprint collision checks, base plot requirements, construction countdowns, instant build calculations, and demolition refunds (35% with plot preservation).
- **Housing & Contracts:** Contract selection from definitions, contract signing countdowns, rent collection cycles, missed rent abandonment, and contract cancellation.
- **Commerce & Shops:** Commercial buildings requiring customer traffic from nearby renting houses, rent cycles, and synchronized customer radius calculation.
- **Decorations & Influence:** Decoration radius calculations boosting rent percentage for surrounding residential properties.
- **Company Value & Progression:** Real-time company value computation based on property values, contracts, and player treasury. XP thresholds and level-ups mapped to original formulas.
- **Land Expansions:** 25 purchasable plots across 36 sectors, with order-based unlocks and price tiering.
- **City Services & Contractors:** Rent Collector, Contract Renewal, and Crane/Move operators (11 × 11 operational zones and 24-hour rentals).
- **Traffic Engine:** Road-following pedestrian and vehicular agents, speed acceleration profiles, building-specific vehicles, and lifetime expiration.
- **Missions & Rewards:** Progression-driven mission triggers, condition validation, one-time reward payouts, and storage system for earned buildings.
- **Offline NPC Visits:** Visit offline NPC cities (e.g. Ronald, Sheik) in visitor mode, complete daily upgrade quotas (+100 Coins, +10 XP), and return with accumulated progress.
- **State Persistence & Resilience:** JSON save storage in `localStorage` (`mcity.save.v1`), automated version migrations (v1 -> v2 -> v3), strict structural schema validation, and automatic fallback to previous valid snapshots on corruption. Multiple profile support (`mcity.save.v1.p_<id>`).

### Visuals, Audio & UI
- **Camera & Zoom:** Smooth panning, map boundary clamping, and 6 discrete zoom levels (1.0, 0.75, 0.5, 0.4, 0.3, 0.25).
- **Vector-Faithful Sprites:** High-resolution 2× sprite atlases rendered from original vector symbols with matching frame animations (25 FPS).
- **Faithful HUD & Panels:** DOM-based reproduction of the original HUD, options panel, friend bar, contractor bar, shop cards (with lock tints and wonder frames), and mission popups.
- **Audio Management:** Sound event mapping, duplicate sound suppression, and background city ambiance.

---

## Technology Stack

- **Game Engine:** [Phaser 3.90.0](https://phaser.io/) (WebGL / Canvas)
- **Language:** [TypeScript 5.9.3](https://www.typescriptlang.org/) (ES2020 target)
- **Runtime / Test Runner:** [Node.js](https://nodejs.org/) (native `node:test` suite)
- **Desktop Shell:** [Electron 44.10.0](https://www.electronjs.org/) (sandboxed, context-isolated, network-blocked)
- **Asset Pipeline:** Python 3.10+ (custom `swfkit` parser, SVG extraction, headless browser rasterization)

---

## Project Structure

```
├── desktop/         # Electron desktop wrapper (main.js, package.json, installer config)
├── docs/            # Technical analysis, engine facts, completion criteria, and roadmaps
├── public/          # Public web assets (HTML, CSS, JSON rules, atlases, sounds)
│   ├── assets/      # Generated locally from original game files; not in the repository
│   ├── css/         # UI styling (game.css)
│   ├── data/        # Offline NPC cities and default city definitions
│   └── vendor/      # Client dependencies (phaser.min.js)
├── src/             # TypeScript source code
│   ├── audio/       # Audio event dispatch and sound effect management
│   ├── game/        # Pure game logic (state, economy, autotiling, geometry, missions)
│   ├── scenes/      # Phaser 3 scenes (CityScene, map background, rendering)
│   ├── services/    # Storage abstraction (SaveStore, local profiles)
│   └── ui/          # DOM UI panels (HUD, Shop, Contractors, Popups, Missions)
├── tests/           # Comprehensive unit tests (131 automated tests)
├── tools/           # Build tools, asset extraction pipeline (swfkit), local dev server
└── vendor/          # Vendored dependencies with SHA-256 integrity verification
```

---

## Prerequisites & Installation

### Prerequisites
- **Node.js:** v18.0.0 or later (v20+ LTS recommended)
- **npm:** bundled with Node.js
- **Python 3.10+** with Pillow and fontTools (`pip install Pillow fontTools`), required to prepare the game assets.
- **Microsoft Edge or Google Chrome**, used headless by the asset pipeline to render vector graphics. The standard Windows install paths are detected; otherwise set `SWFKIT_BROWSER` to the browser executable.
- **The original game files:** the `Datas` directory of an original *Millionaire City* client that you have obtained legally. They are not provided by this project.

### Setup
Clone the repository:
```bash
git clone https://github.com/DimitrijeJovic/millionaire-city-html5.git
cd millionaire-city-html5
```

Compile TypeScript source files:
```bash
npm run build
```
This compiles `src/**/*.ts` into `public/js/` using the vendored TypeScript compiler. It does not need the game assets.

---

## Preparing the Game Assets

The runtime assets in `public/assets/` are generated from the original game files and are never committed (`.gitignore` excludes everything in `public/assets/` except two README files).

```bash
python -I tools/build_assets.py --source "<path to the original Datas directory>" --all-items
```

- `--source` can be replaced by the `MCITY_DATAS_SOURCE` environment variable. The script refuses a source directory inside the project, and it reads the original files without changing them.
- Among other things it reads `Dollars.swf`, `Locale/EN.txt`, `rules/`, `Assets/`, `sounds/`, `feed/`, `pages/` and `button/` from that directory, so it needs a complete `Datas` tree.
- It writes item and UI atlases, background tiles, sounds, rules JSON, `locale/en.json`, `manifest.json`, and `provenance.json` (source path, SHA-256, and conversion method for every output). `--all-items` converts every building in the rules; without it, only the buildings used in `public/data/city.json` are converted.
- Original fonts are optional; see [public/assets/fonts/README.md](public/assets/fonts/README.md).

Without these files, `npm test` stops with a message that the assets are missing, and the game page shows the same message instead of starting.

---

## Running the Game

Start the local development server:
```bash
npm run serve
```
Then navigate to:
```
http://127.0.0.1:8417/
```

### URL Parameters for Testing & Development
- `?city=test`: loads isolated test city data (`public/data/city_test.json`) without affecting your default save.
- `&fresh=1`: resets the test city save state on reload.
- `&view=1090,690`: sets initial camera viewport coordinates.
- `?visit=npc_advisor` or `?visit=npc_boss`: opens direct visit mode for NPC cities.

---

## Automated Testing & Verification

Run the full automated test suite (requires the generated assets, because most tests read the original rules data from `public/assets/rules/`):
```bash
npm test
```

The test runner compiles TypeScript and executes all **131 unit tests** covering:
- Building placement rules and footprint collision
- Economic formulas, rent countdowns, and abandonment
- Autotiling bitmasks (all 47 forms) and road connectivity
- Land expansion orders and pricing
- Mission triggers, completion states, and reward payouts
- Save file migration and corruption recovery
- Traffic spawning, acceleration, and lifecycle
- Contractor durations and zone bounds
- NPC visit limits and reward allocations

All 131 tests pass with zero failures.

### Performance Checks

- **Simulation hot paths:** the per-second economy step recomputed every footprint for every shop (O(shops·N²)); it now builds one snapshot per step, and decoration influence is cached. `tests/performance.test.mjs` checks that the cached results match the uncached ones.
- **Browser measurements:** 180-second runs in Chrome at 1920 × 1080 averaged about 180 FPS (the display refresh rate) with the simulation at 25 steps per second. Occasional frames above 50 ms remain when panels open or close and when panning at the lowest zoom level.
- Details, including memory measurements and open items, are in `docs/report.md` (Serbian).

---

## Building the Desktop Application

The project includes an Electron wrapper configured for maximum isolation and security:
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- All outbound network calls (`http://`, `https://`, `ws://`) are blocked
- Assets served strictly via internal `app://mcity/` scheme

To assemble the portable Windows desktop package:
1. Ensure the web application is built: `npm run build`
2. Download official Electron binaries (e.g. `electron-v44.10.0-win32-x64.zip`) into `build/electron_dl/runtime/`
3. Run the desktop assembly script:
   ```bash
   python -I tools/build_desktop.py
   ```
Outputs will be created in `dist/windows/`.

---

## Asset Reconstruction Pipeline

Runtime assets (`public/assets/`) are generated from original Flash game archives using an in-house Python pipeline (`tools/swfkit`):
- `swfparse.py`: Custom zero-dependency SWF binary parser
- `export.py`: Extracts vector shapes, morph targets, gradients, and bitmap fills
- `svgexport.py`: Converts Flash vector records to standard SVG definitions
- `rasterize.py`: Renders vector graphics at 2× resolution using headless Chromium/Edge
- `atlas.py`: Packs rendered sprites into texture atlases and generates metadata

To generate the assets, see [Preparing the Game Assets](#preparing-the-game-assets).
Every exported asset records its source file, SHA-256 hash, and conversion method in `public/assets/provenance.json`.

---

## Known Limitations

As of version 0.9.0, the following systems are planned or in progress:
- **Gold-to-Cash Exchange:** UI button present; exchange calculations not yet hooked to economy rules.
- **Collectibles & Mystery Gifts:** Collection sets and item gift delivery are omitted from offline gameplay.
- **HQ Road Connection Check:** Visual connections are rendered; strict pathfinding checks from buildings back to the HQ are not yet enforced.
- **Social Graph / Real Friends:** Neighbor interactions are restricted to offline NPC cities (Ronald and Sheik).
- **Multiple City Slots:** City management is currently single-city per profile.

---

## Provenance & Third-Party Notices

- **Original Game IP:** *Millionaire City* was created by Digital Chocolate. Original graphics, sounds, and game balance rules remain the intellectual property of Digital Chocolate or its respective successors. This project is not affiliated with or endorsed by them.
- **Game assets in this repository:** the current version contains no generated game assets. Earlier commits, including tag `v0.9.0`, still contain the `public/assets/` files that were published before this change.
- **Asset Attribution & Provenance:** See [ASSET_ATTRIBUTION.md](ASSET_ATTRIBUTION.md) for full attribution, asset separation, provenance records, and copyright statements.
- **Third-Party Libraries:**
  - **Phaser 3.90.0:** MIT License (Photon Storm Ltd). License copy at [public/vendor/PHASER_LICENSE.md](public/vendor/PHASER_LICENSE.md).
  - **TypeScript 5.9.3:** Apache License 2.0 (Microsoft Corporation). License copy at [vendor/typescript/LICENSE.txt](vendor/typescript/LICENSE.txt).
  - **Electron:** MIT License (OpenJS Foundation).
- **Fonts:** Commercial fonts (Challenge Bold LET, Helvetica Rounded LT Std, Arial) are excluded from the repository. Fallback styles are defined in `public/assets/fonts/fonts.css`, which the asset pipeline generates. See [public/assets/fonts/README.md](public/assets/fonts/README.md).
- **Historical Documentation:** Supplemental technical research documents (`docs/report.md`, `docs/manual_checklist.md`, `docs/engine_facts.md`) are preserved in Serbian as historical development logs.
