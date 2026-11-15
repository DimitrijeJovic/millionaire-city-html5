# Kriterijumi završetka rekonstrukcije

Stanje na kraju faze 5 (2026-10-30); faza 5 nije menjala kategorije, samo internu implementaciju (vidi `report.md`). Svaki sistem ima jednu glavnu kategoriju i dokaz. Ukupan procenat se ne daje:
sistemi nisu iste veličine, pa bi broj bio proizvoljan. Brojevi ispod su prebrojani redovi ove tabele.

## Kategorije

| Kategorija | Značenje |
|---|---|
| ORIGINAL FIDELITY VERIFIED | potvrđeno poređenjem sa originalnim kodom (ABC disasembl, XML pravila) **i** viđeno u HTML5 igri, ili poređeno sa snimkom originalne igre |
| IMPLEMENTED AND TESTED | implementirano po originalnom kodu i pokriveno automatskim testom; u igri nije posebno pregledano |
| MANUALLY VERIFIED | provereno u HTML5 igri (snimak ekrana, merenje, stanje), ali bez poređenja sa originalnom igrom |
| PARTIALLY IMPLEMENTED | deo originalnog ponašanja nedostaje |
| BLOCKED BY ORIGINAL BACKEND | zahteva podatke koje je davao server igre, a nema ih u instalaciji |
| NOT IMPLEMENTED | moguće lokalno, ali nije urađeno |

„Viđeno u igri“ znači automatizovanu sesiju u Chrome-u sa snimcima ekrana (`tools/manual_session.py`), ne ljudsko igranje.

## Sistemi

| Sistem | Kategorija | Dokaz |
|---|---|---|
| Mapa, teren, putevi, autotiling, pešački prelazi | ORIGINAL FIDELITY VERIFIED | `evidence/slice_2026-10-29/original_labcopy_view.png` vs `new_client_labcopy_view.png`; `tests/core.test.mjs` |
| Grafika objekata (SWF izvoz, 385 predmeta) | ORIGINAL FIDELITY VERIFIED | poređenje sa laboratorijom; `provenance.json` |
| 54 predmeta bez SWF-a u instalaciji | BLOCKED BY ORIGINAL BACKEND | fajlovi su se preuzimali sa CDN-a i ne postoje lokalno (`build_assets` status `missing_swf`); ne prave se zamene |
| Kamera i zum | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 8: šest nivoa (originalni 1/0,75/0,5/0,4 i dodati 0,3 i 0,25 = `ToolsBar.ZOOM_MIN`); mapa manja od prozora se centrira; `tests/phase8.test.mjs`, `evidence/phase8_2026-11-04/chrome/zoom_*.png` |
| HUD | ORIGINAL FIDELITY VERIFIED | `evidence/economy_2026-10-29/hud_compare.png` |
| Ekonomija kuća (ugovor, kirija, uticaj, napuštanje) | ORIGINAL FIDELITY VERIFIED | `tests/economy.test.mjs`; kod `StateOnRent`; u igri `phase3/session2_economy` |
| Prihodi prodavnica | ORIGINAL FIDELITY VERIFIED | `tests/shop.test.mjs`; 280 $ = 40 × 7 u igri |
| Isplata najviše jednom (ponovni klik, stariji snimak, ponovno učitavanje) | IMPLEMENTED AND TESTED | testovi „collected once“, „restored from an older save copy“, „round trip mid-game“ |
| Gradnja, rušenje, povraćaj | ORIGINAL FIDELITY VERIFIED | `tests/construction.test.mjs`; `ItemObject.demolish`; u igri faza 3 |
| Prozor potvrde rušenja (`PopupDestroy`) | MANUALLY VERIFIED | `phase3/session5_original_ui/04b_destroy_popup.png`; nije poređen sa snimkom originala |
| Prozor izbora ugovora (`ContractBox`) i info ugovora | MANUALLY VERIFIED | `phase3/session5_original_ui/02_contract_panel.png`, `02b_contract_info.png` |
| Ugovor bez dovoljno novca | PARTIALLY IMPLEMENTED | faza 4: `popup_confirm` sa `TID_NO_CASH_TITLE` / `TID_NO_CASH_BODY_FAKE_FBC`; zamena zlata (`startExchangeGold`) nije preneta; Facebook krediti blokirani |
| Prodavnica (kartice, okviri, cene, zaključavanje) | ORIGINAL FIDELITY VERIFIED | `toolbar_shop_vs_original.png`; `tests/shopcatalog.test.mjs` |
| Info-okviri prodavnice: kuće, prodavnice, dekoracije | MANUALLY VERIFIED | `phase3/session7_shop_info/01a_shop_info.png` |
| Info-okvir čuda | IMPLEMENTED AND TESTED | faza 4: `ShopMenuInfoWonder`; `tests/contracts_ui.test.mjs`; u igri nije pregledan |
| Info-okvir klubova | NOT IMPLEMENTED (nije dostižan) | jedini klub `club_001` je u A/B grupi `mc_crew_mechanics_B`, koja se ne učitava |
| Proširenja | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | `tests/expansions.test.mjs`; `phase2/expansions_rename_plane.png` |
| Kupovina proširenja preko investicija | BLOCKED BY ORIGINAL BACKEND | traži uspešne investicije prijatelja |
| Čvrste pločice | IMPLEMENTED AND TESTED | testovi; nije poređeno sa originalom u igri |
| Skladište | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | testovi; `phase2/storage_panel.png`; postavljanje kao izgrađen je zaključak |
| Misije (87 pravila, brojači, lanci, nagrade, isplata jednom) | IMPLEMENTED AND TESTED | `tests/missions.test.mjs`; stanja pravog snimka se reprodukuju |
| Prozori misija i slike misija | MANUALLY VERIFIED | `phase3/session6_plane_mission/04c_mission_image.png` |
| Novi nivo | MANUALLY VERIFIED | `phase3/session2_economy/04_level_popup.png`; „0 items unlocked“ za nivo 4 nije poređeno sa originalom |
| Zvuk | MANUALLY VERIFIED (izlaz izmeren) | `phase3/session2_economy/audio_results.json`; slušanje NOT VERIFIED |
| Saobraćaj | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | `tests/traffic.test.mjs`; 191 s u Chrome-u; poluprečnici skretanja 11/21 px umesto 12/22 (PARTIAL) |
| Avion (okidač, put, brzina, uklanjanje, zastavica) | MANUALLY VERIFIED | `phase3/session1/plane_path.json`, `phase3/session6_plane_mission/06b_plane_zoom.png`, `tests/flag.test.mjs` |
| Avioni `plane_02/03/04` | NOT IMPLEMENTED | dostižni samo kao nagrada kolekcija (`collectiblesRewardDefinitions`), a kolekcije ne postoje; `plane_04` je `plane_show.swf` (276 kadrova) |
| Kolekcije | NOT IMPLEMENTED | van obima dosadašnjih faza |
| Snimak: verzija, migracija v1→v3, validacija, rezervna kopija | IMPLEMENTED AND TESTED | `tests/savestore.test.mjs`, „version 1 saves migrate“, „save validation“; faza 4 ispravila gubitak rezervne kopije |
| Ponovno učitavanje u igri | MANUALLY VERIFIED | `reload.json` u svih 8 sesija faze 3 |
| Posete NPC gradovima (Ronald ili Cindy: Chocolate Fields; Sheik: Sheik`s City) | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 8: klik na komšiju učitava originalni offline grad u ulozi posetioca (`?visit=`), Go Home, natpis „offline NPC city“, avion; sopstveni grad se ne menja (`tests/phase8.test.mjs`, `evidence/phase8_2026-11-04/chrome/visit_*.png`). Drugih NPC gradova u originalnim fajlovima nema |
| Posete prijateljima i partnerima | BLOCKED BY ORIGINAL BACKEND | `universeFriend.xml`, `friendsList.xml`, `neighborList.xml` ne postoje |
| Nadogradnje u poseti | PARTIALLY IMPLEMENTED | faza 8: radi u igri (samo kuće u najmu, `StateOnRentVisitor`; NPC dobija običnu nadogradnju 100 $/10 XP, super 150 $/15 XP je samo za partnere); 5 po poseti, 12 h i 1500 dnevno su pretpostavljene serverske vrednosti iz `social.xml`, čuvaju se lokalno (`mcity.visits.v1`) |
| `collectUpgraded` | BLOCKED BY ORIGINAL BACKEND | traži prijatelje koji nadograđuju igračev grad |
| Investicije | BLOCKED BY ORIGINAL BACKEND | faza 4: pravila u `src/game/investments.ts`; faza 8: original nudi samo Facebook prijatelje koji još ne igraju (`InvestManager.friendsToInvestPopulate` → `getFriendsNoNeighbors`), NPC nikad, pa lokalna verzija ne bi bila originalna |
| Windows desktop verzija (EXE, instaler) | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 6: provera izgrađenog EXE-a (portable i instaliran), `evidence/phase6_2026-10-30/*_exe`; restart Windows-a NOT VERIFIED |
| FPS i memorija u pregledaču | MANUALLY VERIFIED (60 Hz) | faza 6: 3 min 60 FPS, 1% low 59,5, JS heap bez rasta; 2560×1440 i visoka osvežavanja NOT TESTED |
| Ikonice prodavnice (svih 385 predmeta) | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 6: `ItemDefinition.getIcon` (simbol `normal`), `evidence/phase6_2026-10-30/icons` |
| Ekonomski korak (performanse) | IMPLEMENTED AND TESTED | faza 5: 4,29 → 0,63 ms za 496 objekata, isto stanje (`evidence/phase5_2026-10-30/bench_*.json`); u pregledaču nije mereno |
| Contractors: Rent Collector i Contract Renewal | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 8: originalni `button_multifuncion`, `PopupRentMoneyCollector`, `popup_contract`, ponude iz `servicesDefinitions.xml` plaćene zlatom (klijent sam naplaćuje), oblast 11×11 iz `settings.xml`; `src/game/services.ts`, `evidence/phase8_2026-11-04/chrome/contractors_*.png` |
| Contractors: Move (premeštanje objekata) | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 9: `ToolMove`, `PopupConfirmMove`, `PopupPayMove`, usluga `move` 24 h / 10 zlata; `tests/phase9.test.mjs`, `evidence/phase9_2026-11-04/chrome/functional/move_*.png`; zaokruživanje cene je pretpostavka |
| Otkazivanje ugovora | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 9: `StateOnRent.doDoClick` / `TID_CANCEL_CONTRACT` / 3000 ms; bez provere povezanosti sa HQ |
| Skladište (`PopupStorage`) | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 9; dugme Collectibles iz `VaultBar` nije preneto (kolekcije ne postoje lokalno) |
| Vrednost firme u HUD-u | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 9: originalna formula pri svakom osvežavanju; u poseti vrednost vlasnika (`HudOwner`) |
| Prodavnica: podloga svih kartica | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 9: 379 kartica u 6 lista, 3 prolaza (`evidence/phase9_2026-11-04/shop/`); `shop_box_wonder`, providnost zaključanih 50 % |
| Prozori dobrodošlice za usluge | nije originalno ponašanje | `PopupServicePresentation` se u originalu ne prikazuje |
| Zum: prevlačenje male mape, okolina mape, ekran učitavanja | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 9; prevlačenje i produžetak ivica nisu originalni, ekran učitavanja jeste |
| Prodavnica: istekle ponude ograničenog trajanja | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 8: prikazane kao zaključane „Limited time!“; lokalna opcija (nije originalna) dozvoljava kupovinu; `tools/shop_inventory.mjs` |
| Više lokalnih profila | IMPLEMENTED AND TESTED + MANUALLY VERIFIED | faza 8: dodatak desktop verzije, ne original; podrazumevani profil zadržava stare ključeve |
| Edge 156 | — | ruši se posle ~60 s i na praznoj stranici; nije problem igre |

## Šta bi trebalo za pun završetak

1. Prikaz tuđeg grada u ulozi posetioca (NPC gradovi već imaju originalne podatke), avion pri ulasku, nadogradnje klikom.
2. Zamena zlata za novac kada nema dovoljno novca (lokalno pravilo `RulesFacade.getDCCashToDCCoins`).
3. Kolekcije i avioni `plane_02/03/04`.
4. Ljudska ručna provera po `docs/manual_checklist.md` (slušanje zvuka, vizuelno poređenje sa originalnom laboratorijom).
5. Sve što je BLOCKED BY ORIGINAL BACKEND traži podatke koje original više ne nudi; ne izmišlja se.
