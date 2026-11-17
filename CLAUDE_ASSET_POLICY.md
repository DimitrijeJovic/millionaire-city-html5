# Asset Policy for Claude Code Sessions

Read this file before any work in this repository that touches `public/assets/`, `public/data/`, `.gitignore`, the asset pipeline (`tools/build_assets.py`, `tools/swfkit/`), Git history or publication. It records a decision by the repository owner and overrides any default assumption.

## Project context

- Millionaire City HTML5 is an educational fan-made restoration and reimplementation of the discontinued Flash game *Millionaire City* (Digital Chocolate). It started from the community rebuild `wman810/millionaire-city-rebuilt`.
- The owner's work is the TypeScript code (`src/`), tests (`tests/`), tools (`tools/`), the desktop shell (`desktop/`) and the documentation.
- The owner does **not** own the original game, its code, graphics, sounds, text, rules data, or other original assets. Never assume otherwise.

## Decision: Option C (November 2026)

The owner chose Option C:

- The technical project stays public: source code, tools, tests, configuration and documentation.
- Game assets are not part of the current public repository version. `public/assets/` was removed from Git tracking; the local copies on the owner's machine were kept.
- Every user generates the assets locally from their own legally obtained original game files with `python -I tools/build_assets.py --source "<Datas dir>" --all-items` (or `MCITY_DATAS_SOURCE`).
- `.gitignore` excludes everything in `public/assets/` except `public/assets/README.md` and `public/assets/fonts/README.md`.
- Without generated assets, `npm test` stops with a message from `tools/check_assets.mjs`, and `public/index.html` shows a message instead of starting the game.

## Historical context

An earlier audit (November 2026) found the following about the original source files behind `public/assets/`:

- 151 files whose origin was not conclusively established (108 item SWFs, 32 shop icons, 9 mission images, 1 loading image, 1 rules file).
- 435 third-party files (431 identical to `wman810/millionaire-city-rebuilt`, 4 from its 0.1.0 build) whose redistribution rights require consideration. That project's licence excludes the game assets.

The owner believes some or all of the 151 files may have been created, converted or modified by the owner and AI during the engine migration. **Option C applies regardless of that unresolved question.** Do not reintroduce any of these files, or anything generated from them, into the public repository on the basis of that belief.

`public/data/` (city and NPC city fixtures) is still tracked. `ASSET_ATTRIBUTION.md` lists those files as derived from original definitions. Their status has not been decided separately; ask the owner before changing or publishing them in a new way.

## Git history warning

The earlier public history, including commit `dfa877c` and tag `v0.9.0`, still contains the assets. Option C does **not** authorise any of the following:

- rewriting Git history or published commits;
- force-pushing;
- deleting, moving or modifying tags;
- removing assets from historical commits.

Each of these needs separate, explicit approval from the owner.

## Rules for every future session

1. Preserve the asset separation. Never add files from `public/assets/` (other than the two README files) to Git, and never weaken the `.gitignore` rules for that folder, without the owner's explicit approval.
2. Never assume the owner owns original game assets, and never state or imply that the project has permission to redistribute them.
3. Keep locally supplied original files and generated assets out of Git tracking. Before every commit, run `git status` and confirm nothing under `public/assets/` is staged except the two README files.
4. Do not modify, move or delete the owner's local asset files or original game files. The asset pipeline reads original files read-only and refuses a source directory inside the project; keep it that way.
5. Do not print the contents of asset files, original game files or secrets into reports, logs or chat. Report paths, counts and hashes instead.
6. Keep the source code, tools and tests working with user-provided local assets. When a change affects asset loading, keep the clear missing-assets messages in `tools/check_assets.mjs` and `public/index.html` working.
7. Explain missing assets clearly; never let the game or the tests fail silently because assets are absent.
8. Never claim the game runs, or that tests pass, on a clean clone without generated assets.
