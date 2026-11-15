# Millionaire City HTML5

An independent clean-room HTML5 reimplementation of the classic city-building game *Millionaire City* (originally developed by Digital Chocolate).

Built from the ground up using modern web technologies (**Phaser 3.90.0** + **TypeScript 5.9.3**), this project aims to preserve and reconstruct the core game mechanics, rendering fidelity, and simulation logic without relying on legacy Flash runtimes or PepperFlash plugins.

> [!NOTE]
> **Development Status: v0.9.0 (Phase 9 Milestone)**  
> This release represents an active development milestone, not a 100% feature-complete game. Core economy cycles, construction, contract signing, shop purchases, map geometry, NPC visits, offline missions, and traffic simulation are fully playable.

---

## Table of Contents

- [Overview & Architecture](#overview--architecture)
- [Implemented Systems](#implemented-systems)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites & Installation](#prerequisites--installation)
- [Running the Game](#running-the-game)
- [Automated Testing & Verification](#automated-testing--verification)
- [Building the Desktop Application](#building-the-desktop-application)
- [Asset Reconstruction Pipeline](#asset-reconstruction-pipeline)
- [Known Limitations](#known-limitations)
- [Provenance & Third-Party Notices](#provenance--third-party-notices)

---

## Overview & Architecture

Unlike projects that wrap legacy SWF binaries in Flash emulators or PepperFlash containers, this project is an independent, native HTML5 reconstruction:
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
│   ├── assets/      # Game data: rules, icons, atlases, locale, items, sounds, fonts
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
- *(Optional)* **Python 3.10+** with Pillow (`pip install Pillow fontTools`) if rebuilding assets from original files.

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
This compiles `src/**/*.ts` into `public/js/` using the vendored TypeScript compiler.

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

Run the full automated test suite:
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

To regenerate assets:
```bash
python -I tools/build_assets.py --source "<path_to_original_Datas>" --all-items
```
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

- **Original Game IP:** *Millionaire City* was created by Digital Chocolate. Original graphics, sounds, and game balance rules remain the intellectual property of Digital Chocolate or its respective successors.
- **Asset Attribution & Provenance:** See [ASSET_ATTRIBUTION.md](ASSET_ATTRIBUTION.md) for full attribution, asset separation, provenance records, and copyright statements.
- **Third-Party Libraries:**
  - **Phaser 3.90.0:** MIT License (Photon Storm Ltd). License copy at [public/vendor/PHASER_LICENSE.md](public/vendor/PHASER_LICENSE.md).
  - **TypeScript 5.9.3:** Apache License 2.0 (Microsoft Corporation). License copy at [vendor/typescript/LICENSE.txt](vendor/typescript/LICENSE.txt).
  - **Electron:** MIT License (OpenJS Foundation).
- **Fonts:** Commercial fonts (Challenge Bold LET, Helvetica Rounded LT Std, Arial) are excluded from the repository. Fallback styles are defined in `public/assets/fonts/fonts.css`. See [public/assets/fonts/README.md](public/assets/fonts/README.md).
- **Historical Documentation:** Supplemental technical research documents (`docs/report.md`, `docs/manual_checklist.md`, `docs/engine_facts.md`) are preserved in Serbian as historical development logs.
