# Phase 9 progress (2026-11-04)

Backup: `build/backups/phase9_start_20261104_1647.tgz` (SHA-256 in `docs/evidence/phase9_2026-11-04/integrity/backup_sha256.txt`).
Release hashes before work: `docs/evidence/phase9_2026-11-04/integrity/release_hashes_before.txt`.

## Causes found (before any code change)

| # | Problem (user screenshot) | Cause | Evidence |
|---|---|---|---|
| 1 | Unknown circle bottom-left | `.profile-toggle` (Local Profile Settings button added in phases 7/8, `#profile-host` at left 0 / top 50%). Not a joystick; no touch or debug code exists in `src/`. | `public/css/game.css` `.profile-toggle`, `src/ui/ProfilePanel.ts` |
| 2 | Vault (gift box) opens an empty "Shop" | The storage list reuses the Shop panel. The original opens `PopupStorage` (`GUI/Storage.swf` `popup_storage`, title `TID_POPUP_STORAGE_TITLE`, `TID_STORAGE_EMPTY` when empty). | `PopupStorage.<init>` |
| 3 | Cancel contract | Original: left click on a renting house (not a commerce, HQ connected) opens `PopupConfirmDestroy` with `TID_CANCEL_CONTRACT`; accept sets `MODE_CANCELING_CONTRACT`; after `CONTRACT_CANCEL_TIME` = 3000 ms the house goes to `MODE_WAITING_FOR_CONTRACT`. No refund. Not RMB. | `StateOnRent.doDoClick`, `contractCancelOnAccept`, `doDoLogicUpdate`, slot values |
| 4 | Special Offer label above a green circle | The circle is the original badge (`popup_contract_box/best`, green gradient ellipse). The original text field sits on the badge rotated about -17 degrees; the layout export only kept an axis-aligned box, so the text was drawn unrotated above it. | `ItemService.<init>`, houses_info.swf #859 |
| 5 | Map fixed at maximum zoom-out | Map is 2886 x 2467 px; at 0.25 / 0.3 / 0.4 it is smaller than a 1920 x 1080 view, so `clampCamera` centres it on both axes (as the original `Map.onZoom` does). Nothing can be dragged. | Chrome repro: scroll unchanged after a 230 px drag |
| 6 | White areas | Phaser `backgroundColor: #ffffff` and body `#fff` (the original stage is also `ffffff`), around the map at low zoom; full white page while a city loads after `location.assign` (visit / go home). The original shows `pages/Background_loading.png` while loading. | `src/main.ts`, Dollars.swf SetBackgroundColor |
| 7 | Company value | Stored `profile.companyValue` is only changed by the contractor purchase. Original: recomputed on `visitWorld` and `buyPlot` (`Profile.calculateCompanyValue`) and changed by every coin / gold change (`Profile.set DCCoins`, `set DCCash`), item purchase, demolition, contract and terrain change. `HudOwner.onUpdate` shows the NPC's value during a visit. | Profile / HudOwner disassembly |
| 8 | Shop locked cards blue-gray | Original: `ItemContentLocked.getBox` = `shop_box_locked`, whose shape #63 covers the whole card (-2..127.5 x 0.25..179.55) with (101,151,182) at 80 % over the same grass as `shop_box`. Also `ItemContentLocked.setupIcon` sets the item image alpha 0.5 (not done here). Wonders use `shop_box_wonder` (not exported). | shop.swf, `ItemContentUnlocked.getBox` |
| 9 | Buy Expansion middle column empty | Original places `box_invest_pending` in `box_2` and an "Invest" button. | `PopupConfirmExpansion.showPopup` |
| 10 | Move tool | Original `ToolMove`: pick an own movable item (not HQ), attach to cursor, place on a free spot; same spot = cancel; with the `move` service (24 h, 10 gold) `PopupConfirmMove`, otherwise `PopupPayMove` with movePriceCoins + timePrice(level) x construction minutes x min(instantBuildFactor, 1). | `ToolMove.*`, servicesDefinitions |

## Status (2026-11-04, završeno)

Sve grupe (a)–(f) su urađene; detalji, statusi i dokazi su u `docs/report.md`, odeljak „Faza 9“.

- Izmenjeni fajlovi: `src/main.ts`, `src/scenes/CityScene.ts`, `src/scenes/mapSurround.ts` (nov), `src/game/{camera,construction,gameState,services}.ts`,
  `src/ui/{CityPopups,Contractors,ProfilePanel,ShopPanel,SwfPanel}.ts`, `src/ui/StoragePanel.ts` (nov), `public/index.html`, `public/css/game.css`,
  `tools/build_assets.py`, `tools/swfkit/svgexport.py`, `tools/exe_check.py`, `tools/exe_features.py`, `tools/phase9_checks.py` (nov),
  `tools/phase9_shop_audit.py` (nov), `tests/phase9.test.mjs` (nov), `desktop/package.json` (0.9.0), `build/installer/installer.sed`.
- Rezervne kopije: `build/backups/{build_assets.py,svgexport.py,package.json}.before_p9`, `installer.sed.0.8.0`; `exe_check.py` i
  `exe_features.py` su samo dopunjeni (vraćanje skrivenog prozora, provere faze 9), stara verzija je u `phase9_start_20261104_1647.tgz`.
- Testovi: 131/131; build i stroga provera bez grešaka; Chrome regresija PASS; EXE 0.9.0 portable i instaliran PASS.
- Otvoreno: provera povezanosti sa HQ, `VaultBar` Collectibles, traka otkazivanja na kući, instalacija u `%LOCALAPPDATA%` (NOT VERIFIED).

## Plan (početni)

Implement in groups: (a) assets export (rotation, shop_box_wonder, popup_storage, box_invest_pending, loading image), (b) UI fixes, (c) camera and loading, (d) cancel contract, company value, owner HUD, (e) move tool, (f) tests, Chrome evidence, EXE 0.9.0, docs.
