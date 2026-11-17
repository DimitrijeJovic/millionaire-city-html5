# Generated game assets (not in the repository)

This folder holds the runtime assets of the game: atlases, sounds, rules, locale, `manifest.json` and `provenance.json`. They are converted from the original *Millionaire City* game files, which this project does not distribute. Generate them from your own legally obtained copy of the original `Datas` directory:

```bash
python -I tools/build_assets.py --source "<path to the original Datas directory>" --all-items
```

Everything in this folder except this file and `fonts/README.md` is excluded by `.gitignore`. Do not commit generated files. See the "Preparing the Game Assets" section of the main README and `CLAUDE_ASSET_POLICY.md`.
