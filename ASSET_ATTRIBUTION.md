# Asset Attribution and Provenance Notice

This document details the provenance, ownership, and copyright status of all materials included in or referenced by the **Millionaire City HTML5** project.

---

## 1. Original Game Intellectual Property

*Millionaire City* was originally developed and published by **Digital Chocolate, Inc.** 

- All original game concepts, visual designs, building artwork, character illustrations, audio effects, musical compositions, game balance rules, and text strings are the intellectual property of Digital Chocolate (or its respective successors/rights holders).
- The developers of this HTML5 reimplementation make **no claim of copyright, trademark, or ownership** over any original artwork, audio, narrative, branding, or game designs created by Digital Chocolate.
- This project is an educational fan-made restoration and reimplementation, created for study and preservation. It is not a clean-room implementation: original game files were studied and converted (see §2B and §4).

---

## 2. Separation of Project Materials

To maintain legal and technical clarity, the contents of this repository are categorized into three distinct groups:

### A. Source Code Written for This Project
The following code was written for this project (with AI assistance) and contains no code from the original game:
- **Game Engine & Rules Logic (`src/`):** Pure-logic implementations of map autotiling, coordinate transformations, economic countdowns, rent cycles, decoration radius bonuses, contractor operations, traffic simulation, mission state machines, and local profile management.
- **Rendering & Scene Graph (`src/scenes/`):** Custom Phaser 3 scenes implementing camera management, layered sprite rendering, and viewport culling.
- **User Interface (`src/ui/`):** Custom DOM-based implementations of HUD elements, shop catalogs, contract dialogs, and popups.
- **Automated Test Suite (`tests/`):** 131 unit tests validating economic mechanics, progression formulas, and save data resilience.
- **Conversion & Build Tooling (`tools/`):** Custom zero-dependency Python tools (`tools/swfkit/`) for SWF binary parsing, vector-to-SVG conversion, rasterization, atlas packing, and local development serving (`tools/serve.mjs`).
- **Desktop Shell (`desktop/`):** Custom Electron sandboxing, protocol handling, and security lockdown.

### B. Reconstructed Original Game Assets

> **Not included in this repository.** The files in `public/assets/` and `public/data/` are generated locally by each user from their own original game files and save data (`tools/build_assets.py`, `tools/convert_save.py`, `tools/convert_universe_xml.py`; see the README). They were removed from the repository in November 2026. In November 2026 the repository history was rewritten so that no published commit or tag, including `v0.9.0`, contains these files.

The data files in `public/assets/` are reconstructed from original game resource archives:
- **Sprite Atlases & Item Graphics (`public/assets/items/`, `public/assets/atlas/`, `public/assets/cars/`, `public/assets/background/`, `public/assets/terrain/`, `public/assets/icons/`):** Visual assets converted from legacy SWF vector symbols and bitmaps into high-resolution 2× PNG atlases via `tools/swfkit`.
- **Sound Effects & Audio (`public/assets/sounds/`):** Audio clips extracted from original game files.
- **Rules, Locale & Data Fixtures (`public/assets/rules/`, `public/assets/locale/`, `public/data/`):** Game balance tables, item costs, XP progressions, and localized string definitions translated from original XML/ActionScript definitions into JSON.
- **Provenance Manifest (`public/assets/provenance.json`):** A machine-readable manifest recording the exact source file, source SHA-256 checksum, conversion method, and symbol identifier for every reconstructed asset.

**Where the original files came from** (checked in November 2026 by comparing the SHA-256 values in the manifest with the candidate sources):

| Original source files | Count | Origin |
|---|---:|---|
| Identical to files in the community project [wman810/millionaire-city-rebuilt](https://github.com/wman810/millionaire-city-rebuilt) (also in its downloadable 0.1.0 build) | 431 | That project; its licence states that the original game assets it contains are **not** covered by its MIT licence |
| Present only in the downloadable 0.1.0 build of that project | 4 | Same project; three of them are original shop icons reused for items that had no icon of their own |
| **Origin not recorded** | **151** | 108 item SWFs, 32 shop icons, 9 mission images, 1 loading image, and 1 rules file. They came from a larger local copy of the original game's file tree that I used during development; where that copy came from was not recorded, and it is no longer available |

The full per-file list is kept with the project's audit records.

### C. Third-Party Libraries and Tools
The project incorporates or links to the following third-party components under their respective licenses:
- **Phaser 3.90.0:** Copyright © 2026 Richard Davey, Photon Storm Ltd. Released under the [MIT License](https://github.com/phaserjs/phaser/blob/master/LICENSE.txt). A copy of the license is included at `public/vendor/PHASER_LICENSE.md`.
- **TypeScript 5.9.3:** Copyright © Microsoft Corporation. Released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). License notice located at `vendor/typescript/LICENSE.txt`.
- **Electron (Desktop Runtime):** Copyright © OpenJS Foundation and Electron contributors. Released under the [MIT License](https://github.com/electron/electron/blob/main/LICENSE).

---

## 3. Commercial Font Exclusion

The original game interface utilized commercial proprietary typefaces:
- **Challenge Bold LET** (ITC / Letraset)
- **Helvetica Rounded LT Std** (Linotype GmbH / Monotype Imaging)
- **Arial / Arial Black** (The Monotype Corporation)

**Status:** Because these typefaces are proprietary commercial software subject to strict font redistribution agreements, raw `.ttf` font files are **excluded** from this repository (configured via `.gitignore`). The application CSS (`public/assets/fonts/fonts.css`, generated by the asset pipeline) declares `@font-face` rules that fall back to standard system fonts when local TrueType files are absent. Detailed instructions for licensed font owners are provided in `public/assets/fonts/README.md`.

---

## 4. Redistribution Status & Legal Notice

- **Redistribution Rights:** Redistribution rights for the reconstructed original game graphics, audio, and game balance rules have **not been independently established**.
- **No Claim of Legal Exemption:** This project does not claim or assert that non-commercial distribution, software preservation, transformative recreation, or fair use doctrines automatically grant legal permission for public redistribution of proprietary game assets.
- **Use of the original client:** The original client's ActionScript bytecode was disassembled read-only to learn the game's rules and formulas (`docs/engine_facts.md`). No bytecode, Flash player binary, or Flash client file is included or executed; the game logic in `src/` is a separate TypeScript implementation.
- **Rights Holder Contact:** If you are a copyright or trademark holder for *Millionaire City* or Digital Chocolate assets and have questions, concerns, or requests regarding reconstructed assets in this educational preservation repository or its history, please open an issue in this repository.
