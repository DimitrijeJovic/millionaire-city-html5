# Asset Attribution and Provenance Notice

This document details the provenance, ownership, and copyright status of all materials included in or referenced by the **Millionaire City HTML5** project.

---

## 1. Original Game Intellectual Property

*Millionaire City* was originally developed and published by **Digital Chocolate, Inc.** 

- All original game concepts, visual designs, building artwork, character illustrations, audio effects, musical compositions, game balance rules, and text strings are the intellectual property of Digital Chocolate (or its respective successors/rights holders).
- The developers of this HTML5 reimplementation make **no claim of copyright, trademark, or ownership** over any original artwork, audio, narrative, branding, or game designs created by Digital Chocolate.
- This project is an independent clean-room technical reconstruction created for historical preservation, study, and educational purposes.

---

## 2. Separation of Project Materials

To maintain legal and technical clarity, the contents of this repository are categorized into three distinct groups:

### A. Independently Written Source Code
The software implementation is original work authored independently in TypeScript and Python:
- **Game Engine & Rules Logic (`src/`):** Pure-logic implementations of map autotiling, coordinate transformations, economic countdowns, rent cycles, decoration radius bonuses, contractor operations, traffic simulation, mission state machines, and local profile management.
- **Rendering & Scene Graph (`src/scenes/`):** Custom Phaser 3 scenes implementing camera management, layered sprite rendering, and viewport culling.
- **User Interface (`src/ui/`):** Custom DOM-based implementations of HUD elements, shop catalogs, contract dialogs, and popups.
- **Automated Test Suite (`tests/`):** 131 unit tests validating economic mechanics, progression formulas, and save data resilience.
- **Conversion & Build Tooling (`tools/`):** Custom zero-dependency Python tools (`tools/swfkit/`) for SWF binary parsing, vector-to-SVG conversion, rasterization, atlas packing, and local development serving (`tools/serve.mjs`).
- **Desktop Shell (`desktop/`):** Custom Electron sandboxing, protocol handling, and security lockdown.

### B. Reconstructed Original Game Assets
The data files in `public/assets/` were reconstructed from original game resource archives:
- **Sprite Atlases & Item Graphics (`public/assets/items/`, `public/assets/atlas/`, `public/assets/cars/`, `public/assets/background/`, `public/assets/terrain/`, `public/assets/icons/`):** Visual assets converted from legacy SWF vector symbols and bitmaps into high-resolution 2× PNG atlases via `tools/swfkit`.
- **Sound Effects & Audio (`public/assets/sounds/`):** Audio clips extracted from original game files.
- **Rules, Locale & Data Fixtures (`public/assets/rules/`, `public/assets/locale/`, `public/data/`):** Game balance tables, item costs, XP progressions, and localized string definitions translated from original XML/ActionScript definitions into JSON.
- **Provenance Manifest (`public/assets/provenance.json`):** A machine-readable manifest recording the exact source file, source SHA-256 checksum, conversion method, and symbol identifier for every reconstructed asset.

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

**Status:** Because these typefaces are proprietary commercial software subject to strict font redistribution agreements, raw `.ttf` font files are **excluded** from this repository (configured via `.gitignore`). The application CSS (`public/assets/fonts/fonts.css`) declares `@font-face` rules that fall back to standard system fonts when local TrueType files are absent. Detailed instructions for licensed font owners are provided in `public/assets/fonts/README.md`.

---

## 4. Redistribution Status & Legal Notice

- **Redistribution Rights:** Redistribution rights for the reconstructed original game graphics, audio, and game balance rules have **not been independently established**.
- **No Claim of Legal Exemption:** This project does not claim or assert that non-commercial distribution, software preservation, transformative recreation, or fair use doctrines automatically grant legal permission for public redistribution of proprietary game assets.
- **Independent Clean-Room Status:** This project does not incorporate decompiled ActionScript bytecode, closed-source Flash player DLLs, or code from the upstream `wman810/millionaire-city-rebuilt` wrapper project.
- **Rights Holder Contact:** If you are a copyright or trademark holder for *Millionaire City* or Digital Chocolate assets and have questions, concerns, or requests regarding the inclusion of reconstructed assets in this educational preservation repository, please open an issue in this repository.
