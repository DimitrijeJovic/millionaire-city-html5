# Izveštaj — HTML5 rekonstrukcija

Projekat: MillionaireCity_HTML5 (original se samo čita).

## Odluke

| Tema | Odluka | Razlog |
|---|---|---|
| Engine | Phaser 3.90.0 (zaključan) + TypeScript 5.9.3 | Prototip pokriva WebGL atlase, kameru/zum, pixel-perfect klik, zvuk sa otključavanjem, tilemap i glow; v3 ima najviše dokumentacije. Paketi su preuzeti sa npm registra uz proveru `integrity`, bez instalacionih skripti. |
| Grafika | Sopstveni SWF → SVG izvoz, rasterizacija u lokalnom Edge-u ili Chrome-u na 2× | Simboli zgrada su vektori + bitmape u SWF bibliotekama; alata za izvoz nema, instaliranje neproverenih je zabranjeno. Rezultat je originalni crtež, bez dorade i AI uvećanja. |
| Animacije zgrada | 25 kadrova/s, vremenski | `BitmapAnimation.update` pomera jedan kadar po `ItemObject.logicUpdate`, a logika radi na 25 FPS scene; ugnežđeni klipovi se pri hvatanju ne pomeraju (`generateAnimation` radi `gotoAndStop` u jednoj petlji). |
| Simulacija | fiksni korak 40 ms, nezavisan od prikaza | Isti tempo kao original; render ide brzinom monitora. |
| Prikaz | ceo prozor umesto 760×594 | Moderni klijent; zum nivoi i brzina zuma su originalni. |

## Status

| Oblast | Status | Dokaz |
|---|---|---|
| Izolacija projekta, original netaknut | PASS | novi direktorijum; snimak i laboratorija čitani samo kao kopije |
| SWF čitač (440 SWF, 4190 oblika, 1470 bitmapa, 3140 sprajtova, 883 morph) | PASS | `evidence/slice_2026-10-29/swf_features.json`, 0 grešaka |
| Izvoz grafike: oblici, gradijenti, bitmape, morph, maske, color transform, glow/senka/blur/colormatrix | PARTIAL | kuće, fontana, HQ, drveće, HUD i ikonice odgovaraju originalu; statični tekst se crta glifovima, dinamička polja se izvoze kao opis; bevel/gradient filteri i Button karakteri još nisu podržani |
| Mapa: pozadina, teren, putevi, autotiling, pešački prelazi | PASS | poređenje sa originalom u laboratoriji (`original_labcopy_view.png` / `new_client_labcopy_view.png`) |
| Grad iz kopije snimka (68 objekata) | PASS | test „city fixture“; svi objekti imaju definiciju |
| Kamera: prevlačenje, zum 1/0,75/0,5/0,4 brzinom 1,25/s | PASS | `interaction_results.json`, test zuma |
| Klik na objekat (pixel-perfect), hover obris, panel | PASS | `hover_select_zoom.png` |
| Animirani objekat (fontana, 30 kadrova, 1,2 s) | PASS | test vremena animacije; prikaz u igri |
| Zvuk: mapiranje originalnih događaja, muzika grada, novac pri naplati, ugovor, zaštita od dupliranja | PASS (izmeren izlaz) | faza 3: Windows Core Audio meri izlazni nivo sesija test-Chrome-a za svaki događaj (`evidence/phase3_2026-10-30/session2_economy/audio_results.json`); čovek nije slušao |
| Tekstovi (TID → EN.txt, 2107 stavki) | PASS | `TextIDs` konstante iz ABC-a; nazivi u panelu |
| Originalni fontovi (Challenge Bold, HelveticaRounded, Arial) iz SWF glifova u TTF | PASS | `fonts.py`, vizuelno poređenje |
| HUD (XP, nivo, traka, ime grada, vrednost, zlato, novac, „Add“) | PASS | `evidence/economy_2026-10-29/hud_compare.png`: raspored, pomeranje za FC, smanjenje natpisa (`setTextScaled`) i traka (`DCFillBar`) prema kodu |
| Ekonomija kuća: ugovor, kirija, uticaj dekoracija, napuštanje, tajmeri iz snimka | PASS | `tests/economy.test.mjs` (9 testova), naplata i potpis provereni u igri (`econ_trio.png`) |
| Isplata najviše jednom (ponovni klik, vraćena starija kopija snimka) | PASS | testovi „collected once“ i „restored from an older save copy“ |
| Lokalni snimak: verzija, validacija, rezervna kopija, uvoz kopije originala | PASS | `SaveStore.ts`, test validacije i uvoza; original se ne menja |
| Ikonice stanja (kirija, ugovor) i animacija naplate | PASS | `daily_bonus.swf` / `contract_event.swf`, pozicija iz `BarPosition` |
| Prozor za izbor ugovora | PASS | faza 3: originalni `ContractBox` iz `contracts.swf` (vidi tabelu faze 3) |
| Prihodi prodavnica: kupci, tajmer u minutima, naplata jednom po periodu, povratak bez kupaca | PASS | `tests/shop.test.mjs`; u igri 280 $ = 40 × 7, drugi klik bez isplate (`evidence/gameplay_2026-10-30/shop_income_icons.png`) |
| Originalne ikonice stanja (PNG trake, takt `TopLayer`) i efekti naplate | PASS | ikonica picerije se poklapa sa referentnim snimkom |
| Traka alata (Select, Buy, Build, Road „Free“, Demolition) na originalnim pozicijama | PASS | `toolbar_shop_vs_original.png` |
| Prodavnica: kartice, 8 okvira po strani, originalni okviri, nazivi, cene, XP, zaključavanje po nivou ili fan uslovu | PASS | `toolbar_shop_vs_original.png`, `tests/shopcatalog.test.mjs` |
| Katalog: 385 od 439 predmeta ima crtež | PARTIAL | 54 SWF-a ne postoje u originalnoj instalaciji i ne nude se; ostalih 385 je izvezeno (velike animacije se rasterizuju u stranicama od 40 kadrova) |
| Teren, postavljanje (duh + zelena/crvena osnova), gradilište, završetak klikom, putevi, rušenje, povraćaj | PASS | `tests/construction.test.mjs` (9), u igri: 4 × 1000 $, kuća −30.000 $, gradilište 10 min, +100 XP, rušenje +10.500 $ (`terrain_build_finish_road.png`, `build_flow_results.json`) |
| Zvuci gradnje: `Build_Sound` pri postavljanju; buldožer pri rušenju osim dekoracija; put i teren bez zvuka | PASS (izmeren izlaz) | faza 3: izlazni nivo 0,28 (gradnja) i 0,43 (rušenje) uz tišinu pre događaja; čovek nije slušao |
| Potvrda rušenja | PASS | faza 3: originalni `PopupDestroy` (vidi tabelu faze 3) |
| Misije: 87 pravila, brojači, pragovi, lanci otključavanja, nagrade (novac, XP, predmeti u skladište) | PASS | `tests/missions.test.mjs` (9); stanja stvarnog snimka se reprodukuju |
| Isplata misije najviše jednom; restart; nema gubitka dostignute nagrade pri učitavanju | PASS | testovi + u igri: +60.000 $, posle ponovnog učitavanja 90.789 $ i misija ostaje preuzeta (`mission_claim_reload_results.json`) |
| Prozori misija (originalni `popup_mission_background_01`, `popup_well_done`) i ikonice misija | PASS | faza 3: misije sa `imageIsRequired` koriste `popup_mission_background_01_image_01` i svoju sliku; ostale prikazuju ikonicu tipa kao i pre |
| Novi nivo: prozor `popup_next_level`, `Level_Sound` | PASS | faza 3: nivo 3 → 4 naplatom kirije u igri, prozor „Level 4“ i izmeren zvuk (`evidence/phase3_2026-10-30/session2_economy/04_level_popup.png`) |
| Događaji misija bez izvora (nadogradnje, posete, investicije, ime grada, proširenja) | NOT FIXED | vidi `roadmap.md` |
| Saobraćaj: pojava po `TrafficAgentManager` formuli, uslovna vozila, desna traka, skretanja, ubrzanje 0,0001 px/ms², sudari, istek i bledenje | PASS | `tests/traffic.test.mjs` (6), u igri (`traffic.png`, `traffic_results.json`) |
| Skretanje: poluprečnici 11/21 px (traka 5 px) umesto originalnih 12/22 | PARTIAL | dva originalna poluprečnika ne daju jednu širinu trake; razlika ±1 px |
| Čestice: teren, put, naplata, kupci prodavnice, završetak gradnje | PASS | originalni klipovi iz `houses_info.swf` i `common.swf` |
| Stabilnost: 60 s rada, FPS ~180, memorija ~15–20 MB bez rasta | PASS | `stability_60s_results.json`; faza 3: 191 s saobraćaja u Chrome-u (vidi tabelu faze 3) |

## Faza 2 (2026-10-30)

| Oblast | Status | Dokaz / napomena |
|---|---|---|
| `buyExpansion` | PASS | `Map.buyExpansion`; test „buyExpansion counts once“; u igri brojač = 1 posle kupovine (`evidence/phase2_2026-10-30/expansions_rename_plane_results.json`) |
| `nameCity` (PopupName → misija REACHED bez brojača) | PASS | `PopupName.saveName`; test „nameCity“; u igri promenjeno ime i dostignuta misija 1 |
| `visitCity`, `visitPartner`, `upgrade` | NOT FIXED | izvori nađeni (`DollarsGame.changeState` u ulozi posetioca, `StateOnRentVisitor.doDoClick`); režim posete ne postoji; ključevi pokriveni testom |
| `collectUpgraded`, `investment`, `investmentDone` | NOT FIXED | izvori: `StateOnRent.onIncome` (kuće koje su nadogradili prijatelji), `PopupInvestSuccess/Fail.close`; traže prijatelje i investicije |
| Proširenja: cena, otključavanje po redu, kupovina novcem ili zlatom, zatamnjene oblasti, znak „EXPANSION FOR SALE“, originalni prozor | PASS | `tests/expansions.test.mjs` (7); u igri −4.000.000 $ i dodate oblasti 8 i 9 (`expansions_rename_plane.png`) |
| Kupovina proširenja preko investicija | NOT FIXED | zahteva uspešne investicije prijatelja (`expansionsGetFriendsNeeded`); prozor prikazuje samo uslov |
| Čvrste pločice `LogicTileSolid` (`rules/universe/map.xml`) blokiraju teren, puteve i gradnju | PASS | testovi; uvezeni grad nema nijedan objekat na čvrstoj pločici |
| Skladište: pregled (Vault), postavljanje bez cene, jedan komad po postavljanju, čuvanje | PASS, uz zaključak | testovi + u igri (`storage_results.json`, `storage_panel.png`); to da se predmet iz skladišta postavlja već izgrađen je zaključak, nije potvrđeno u kodu |
| Avion: okidač i let | PARTIAL → faza 3 | talasanje zastavice preneto u fazi 3; let pri poseti i dalje čeka režim posete |
| Vozila: svih 9, uključujući `car_police` i `car_04` | PASS | ponovljeni izvoz (do 3 pokušaja), 9 × 360 kadrova; smer kadra je ugao `atan2` u koordinatama ekrana (`TrafficAgent.movementSetCurrentDirection`) (`cars_all_headings.png`) |
| Originalni prozori ugovora, potvrde rušenja, info-okvira i slike misija | → faza 3 | preneti u fazi 3. Pretpostavka faze 2 o simbolima je bila pogrešna: `popup_contract` i `popup_confirm_destroy` iz `houses_info.swf` original ne koristi za ove prozore |
| SWF izvoz: bevel, gradient-glow, Button | PASS (nije potrebno) | `research/inventory/swf_features.json`: 0 pojava u svih 440 SWF-ova; prisutni filteri (glow, senka, zamućenje, color matrix) već su podržani |
| Duži rad, stvarni zvuk, novi nivo u igri | → faza 3 | provereno u fazi 3 |

Server igre (127.0.0.1:8417) je zaustavio Claude Code zbog malo slobodne memorije i posle toga nije ponovo pokretan. Zato su
poslednje provere u igri u ovoj fazi one za skladište.

## Faza 3 (2026-10-30)

Okruženje: jedan server na 127.0.0.1:8417 i jedan Chrome 156 sa privremenim profilom. Edge 156 se ovde ruši posle ~60 s
(izlaz 0xC0000005), i to i na praznoj stranici, pa se za duže provere i izvoz koristi Chrome (`SWFKIT_BROWSER`).
Grad je `city=test` (ključ `mcity.save.v1.test`) u praznom privremenom profilu, pa `fresh=1` nije bio potreban.
Pre i posle provera su heševi originala (2 SWF-a, profili i rezervne kopije, 32 fajla) isti.

### A — provera u igri

| Stavka | Rezultat | Dokaz |
|---|---|---|
| Muzika `main.mp3` posle prvog klika | PASS (izmeren izlaz) | vrh 0,18, 103 od 106 uzoraka > 0,01 (`evidence/phase3_2026-10-30/session2_economy/audio_results.json`) |
| `build.mp3` pri postavljanju kuće | PASS (izmeren izlaz) | vrh 0,28, tišina 1,5 s pre događaja (vrh 0,0) |
| `contract.mp3` pri potpisu ugovora | PASS (izmeren izlaz) | vrh 0,74 |
| `money.mp3` pri naplati kirije | PASS (izmeren izlaz) | vrh 0,44; novac 8.965.903 → 8.989.708 |
| `levelup.mp3` pri novom nivou | PASS (izmeren izlaz, zajedno sa `money.mp3`) | vrh 1,0 tokom 3,5 s u prozoru naplate koja je donela nivo; nije izdvojen od zvuka novca |
| `bulldoze.mp3` pri rušenju | PASS (izmeren izlaz) | vrh 0,43 |
| Da li čovek čuje zvuk | NOT VERIFIED | merenje je izlazni nivo audio sesije (Core Audio, `tools/audio_meter.ps1`), ne slušanje |
| Novi nivo u igri | PASS | 1.579 XP + naplata → nivo 4, prozor „Congratulations! Level 4“ (`session2_economy/04_level_popup.png`) |
| Avion posle promene imena | PASS | ime „Phase Three“, start x = 2354 = desna ivica pogleda, y = 912, 125,3 px/s (= 5 px × 25), uklonjen posle 13,4 s (`session1/plane_path.json`) |
| Saobraćaj ≥ 3 min | PASS (headless) / PARTIAL (sa prozorom) | headless: 191 s, logika stalno 25 koraka/s, 3–5 vozila, 6 vrsta (`session4_traffic_headless/traffic_samples.json`). Sa prozorom je prozor posle ~110 s bio minimizovan (`windowState: minimized`), pa pregledač nije crtao; ko ga je minimizovao nije poznato |
| Memorija i FPS | PASS | JS heap 11–21 MB bez rasta tokom 191 s; FPS 180–300 (requestAnimationFrame ovog ekrana) |
| Ponovno učitavanje bez `fresh=1` | PASS | novac, objekti, misije, brojači, skladište, putevi i teren isti; u svih 8 sesija |
| Greške u konzoli | PASS | jedino upozorenje „frame already exists: button_buy/ButtonText“ uklonjeno je na kraju faze (dupli sloj se preskače u atlasu) |

### B — originalni UI

| Prozor | Status | Izvor i dokaz |
|---|---|---|
| Izbor ugovora | PASS | `ContractBox` / `ContractBoxSingle`: `contracts.swf` `popup_background_contract`, `popup_box_contract(_locked)`, ikone `contract_02..14`; 6 po strani u mreži 3 × 2 (XINIT −60, YINIT −12, XOFFSET 114, YOFFSET 147), strelice, naziv `TID_CONTRACT<n>`, cena (`TRUNCATE_THOUSAND`, 6), trajanje (`convertTimeToString`), zaključani ugovori iznad nivoa (`session5_original_ui/02_contract_panel.png`) |
| Info pri prelasku mišem preko ugovora | PASS | `InfoBoxContract`: `popup_info_box_right/left` iz `contracts.swf`, kašnjenje 200 ms, levo kad desno ne staje (`02b_contract_info.png`) |
| Ugovor bez dovoljno novca | NOT FIXED | original nudi Facebook kredite (`startAskForHelpFBCredits`); ovde se ništa ne dešava |
| Potvrda rušenja | PASS | `ItemObject.demolish` → `PopupConfirmDestroy` sa klipom `PopupDestroy` ugrađenim u klijent: `TID_DESTROY_MSG` sa povraćajem zelenom bojom, ili `TID_DESTROY_BUILDING_NOREWARD`; Yes/No (`04b_destroy_popup.png`) |
| Info-okviri prodavnice (`hud.swf` `popup_info_box_*`) | PASS za kuće, prodavnice i dekoracije | `ShopMenuInfoHouse/Commerce/Deco.setUpBox`, položaj iz `ItemContentUnlocked.showInfoBox` (`session7_shop_info/01a_shop_info.png`) |
| Info-okviri čuda i klubova | NOT FIXED | `ShopMenuInfoWonder/Club` nisu preneti |
| Slike misija | PASS | `MissionDefinition.getSkuToLoad`: `Assets/missions/<type>_<parameter>.swf` (beat: `<type>_<condition>`), simbol `image` u klipu `image_01` prozora `popup_mission_background_01_image_01`; svih 5 SWF-ova postoji (`session6_plane_mission/04c_mission_image.png`) |

### C — avion

| Stavka | Status | Izvor i dokaz |
|---|---|---|
| Okidač | PASS | samo `PopupName.saveName` i ulazak u tuđi grad (`DollarsGame.changeState`); drugi okidači ne postoje |
| Položaj, put, brzina, uklanjanje | PASS | start na desnoj ivici pogleda, y = `getBottomY`/2, 5 px po logičkom koraku, uklanjanje kad je x ≤ leva ivica − širina (`Plane.start`, `Plane.logicUpdate`) |
| Talasanje zastavice | PASS | `Flag`: natpis se crta u bitmap veličine klipa `Tail`, na (tail.x − 20, tail.y); 20 traka; traka 1 = 4·sin(0,01 − t·0,002), ostale preuzimaju pomeraj prethodne pri svakom ažuriranju (`06b_plane_zoom.png`, `tests/flag.test.mjs`) |
| Avion `plane_04` (animirani `plane_show`) | NOT FIXED | koristi se samo za `planeSku = plane_04`, koji lokalni profil nema |

### D — posete

| Stavka | Status | Napomena |
|---|---|---|
| `visitCity`, `visitPartner`, `visitFriend`/`visitRonald` | BLOCKED | redosled događaja je u `src/game/visits.ts` (test), ali tuđi grad dolazi sa servera igre; lokalni izvor (`NO_CITY_SOURCE`) ne postoji, pa se misije ne dostižu |
| `upgrade` | BLOCKED | pravila (`social.xml`: +100 $, +10 XP, 5 po poseti, ista kuća posle 12 h) i događaji (`ItemObject.registerEvent`) su u `VisitSession` sa testovima; bez posećenog grada nema primene |
| Ronald / Sheik | BLOCKED | rasporedi njihovih gradova nisu sačuvani u originalu; ne izmišljaju se |

### E — regresija

`node --test tests/`: 82/82. Novi testovi: formatiranje brojeva i vremena, raspored ugovora, nazivi ugovora,
povraćaj pri rušenju bez izmene stanja, slike misija, info-okviri prodavnice, zastavica, posete i nadogradnje.
Proširenja, skladište, vozila, misije i snimak prolaze kao i pre.

## Faza 4 (2026-10-30)

Rad bez pokretanja servera i pregledača: istraživanje originalnog koda, izmene, testovi i izvoz grafike (izvoz koristi
headless Chrome samo za rasterizaciju simbola). Provera u igri čeka potvrdu korisnika. Kategorije svih sistema su u
`RECONSTRUCTION_COMPLETION_CRITERIA.md`.

### Audit — nađeno i ispravljeno

| Nalaz | Posledica | Ispravka | Dokaz |
|---|---|---|---|
| `LocalSaveStore.save` je trenutni zapis uvek prebacivao u `.prev` | ako je trenutni zapis bio oštećen i igra se učitala iz rezerve, prvo snimanje je prepisivalo jedinu dobru kopiju | u `.prev` ide samo validan zapis | `tests/savestore.test.mjs` (pada sa starim kodom) |
| `RenderTexture` zastavice aviona nikad uništen; tekstura ostajala posle preleta | sitno curenje memorije po preletu | objekat se uništava odmah posle `saveTexture` (tekstura ostaje, `RenderTexture.preDestroy`), tekstura se briše kad avion ode | kod; provera u igri čeka |
| Dokumentacija faze 3: „5 po poseti, ponovo posle 12 h“ kao pravilo originala | netačno poreklo | klijent te vrednosti ne čita; broj stiže sa servera (`upgradesUniverseAvailable`) | `RulesFacade.socialLoadOnComplete`, `UpgradesManager.load` |
| Posete partneru davale su obične nadogradnje | pogrešna nagrada | partneri dobijaju super nadogradnje (150 $, 15 XP) | `UpgradesManager.setNeighborId`; test |

Bez nalaza: dvostruka isplata (ciklusi `paidCycles`), dvostruki završetak gradnje, dvostruko preuzimanje misije,
osluškivači i tajmeri prozora (brišu se pri zatvaranju i prelistavanju), uništavanje vozila i efekata.
Poznato, nije menjano: `paidCycles` raste za jedan zapis po naplati. To čuva zaštitu od starije kopije snimka; posle
10.000 naplata to je oko 250 KB.

### Novo

| Oblast | Status | Izvor i dokaz |
|---|---|---|
| Info-okvir čuda | IMPLEMENTED AND TESTED | `ShopMenuInfoWonder.setUpBox`: naziv, veličina, vreme gradnje, opis `TID_WONDER_TYPE_*_INFO` sa `incomeValue` (sat: `TID_WONDER_TYPE_MULTIPLIER_CLOCK_INFO`). Ključ po tipu i cilju je izabran po imenu u locale fajlu, jer brojač tid-ova tipova nije sačuvan |
| Info-okvir kluba | nije dostižan | jedini klub je u A/B grupi `mc_crew_mechanics_B` |
| `plane_04` | NOT IMPLEMENTED | `Plane.setPlane`: `plane_show.swf` simbol `plane`, 276 kadrova (20 fps deklarisano, igra ide 25 fps), na tački mape (1528, 933), bez zastavice, uklanja se posle poslednjeg kadra. Avioni `plane_02/03/04` su nagrade kolekcija, koje ne postoje lokalno; pravi snimak ima `planeSku = plain` |
| Ugovor bez novca | PARTIALLY IMPLEMENTED | `ContractBox.onContract` → `popup_confirm.swf` sa `TID_NO_CASH_TITLE` i `TID_NO_CASH_BODY_FAKE_FBC` (varijanta bez plaćanja, `startNoAction`), samo dugme za zatvaranje. Zamena zlata (`startExchangeGold`) nije preneta |
| NPC gradovi | PARTIALLY IMPLEMENTED | original ima offline režim (`UserDataFacadeOffline.requestTask`): Sheik (poslednji NPC) → `userData/universeAdvisorCity1_AbuDabhi.xml`, ostali NPC → `universeAdvisorCity.xml`. Konvertovano u `public/data/npc_boss.json` (Sheik`s City, 496 objekata) i `npc_advisor.json` (402 objekta), svi sa definicijom i crtežom; `OfflineNpcCitySource` + test. Prikaz posete nije urađen |
| Prijatelji, partneri | BLOCKED | offline fajlovi `universeFriend.xml`, `friendsList.xml`, `neighborList.xml`, `upgradesList.xml` ne postoje u instalaciji |
| Investicije | BLOCKED | `src/game/investments.ts`: definicija, uslov uspeha (vrednost firme prijatelja ≥ 4.000.000), događaji (`PopupInvestSuccess.close`: `investmentDone` + `investment`; `PopupInvestFail.close`: `investment`), jednom po rezultatu. Klijent nikad ne isplaćuje `rewardDCCoins`; rezultat šalje serveru |

### Testovi

`node --test tests/`: 91/91 (`evidence/phase4_2026-10-30/tests.txt`). Novi: rezervna kopija snimka (2), čuda i `popup_confirm` u testu
info-okvira, kruženje snimka usred gradnje, NPC gradovi, super nadogradnje, investicije (4).

## Faza 5 (2026-10-30)

Audit i optimizacija bez pokretanja igre i pregledača (Word je korišćen samo za proveru DOCX-a). Kompletna analiza:
`analysis/MillionaireCity_HTML5_Complete_Technical_Analysis.docx`.

### Pronađeno i ispravljeno

| Nalaz | Prioritet | Ispravka | Dokaz |
|---|---|---|---|
| Ekonomski korak (1/s): za svaku prodavnicu svi otisci ponovo i linearna pretraga stanja kuća, O(prodavnice·N²) | HIGH | jedan snimak otisaka i mapa stanja po koraku; `GameState.allCustomerSids` | benchmark, `tests/performance.test.mjs` |
| Uticaj dekoracija: nova oblast za svaku dekoraciju pri svakoj kući | HIGH | lista dekoracija keširana po listi otisaka (`WeakMap`) | isto |
| Jedinice vremena dva puta (`ContractBox`, `shopInfo`) | MEDIUM | `localeTimeUnits` | build, testovi |
| Formula postavljanja podsimbola na 4 mesta | MEDIUM | `SwfPanel.placeChild` | build, testovi; prikaz NOT VERIFIED |
| Tip `Text` 3 puta, lambda prevoda 5 puta | LOW | `TextLookup`, `CityScene.lookup` | build |
| `Clock.alpha` se nigde ne koristi | LOW | uklonjeno | build, testovi |
| Zastareli komentari (`MissionPanel`, `Toolbar`, `Hud`) | LOW | ispravljeni | — |

Otvoreno: `CityScene.ts` je prevelik (MEDIUM, deljenje tek uz proveru u igri); `stepTraffic` pravi `Set` po koraku
(LOW); atlasi 4096² (INFO, merenje u pregledaču). Ciklusa u uvozima nema; nema `any`.

### Benchmark (`tools/bench/economy_bench.mjs`, isti ulaz, 200 koraka, kod „pre“ iz rezervne kopije `phase5_start`)

| Grad | Objekata | Pre | Posle | Stanje posle 200 koraka (SHA-256) |
|---|---|---|---|---|
| city_test | 67 | 0.055 ms | 0.071 ms | isti |
| npc_advisor | 402 | 1.278 ms | 0.307 ms | isti |
| npc_boss | 496 | 4.292 ms | 0.630 ms | isti |

Renderovanje i memorija u pregledaču nisu mereni (MANUAL VERIFICATION REQUIRED).

### Testovi

`node --test tests/`: 94/94 (`evidence/phase5_2026-10-30/tests.txt`). Novi: `performance.test.mjs` (3) — keširani uticaj i kupci jednaki
direktnom računu na Sheik`s City.

## Faza 6 (2026-10-30)

### Windows desktop verzija

| Stavka | Rezultat |
|---|---|
| Tehnologija | Electron 44.10.0 (Chromium 152.0.7977.169), zvanično izdanje; SHA-256 se slaže sa `SHASUMS256.txt` i npm `checksums.json`. Igra se služi kroz `app://` (bez servera i porta); `contextIsolation`, `sandbox`, bez Node integracije, preload skripte i IPC-a; spoljni zahtevi blokirani |
| Portable | `dist/windows/Millionaire City HTML5/` (636 MB, 1159 fajlova); zip 397 MB |
| Instaler | `dist/windows/MillionaireCityHTML5-0.6.0-setup-win-x64.exe` (386 MB, IExpress); `%LOCALAPPDATA%\Programs\Millionaire City HTML5`, prečice, `Uninstall.cmd` |
| Sačuvane igre | `%APPDATA%\Millionaire City HTML5` (van programa; instalacija, ažuriranje i deinstalacija ga ne diraju) |
| Provera izgrađenog EXE-a (portable i instaliran, van projekta, privremeni profil) | PASS: igra i NPC podaci učitani, 0 otvorenih portova, spoljni zahtev blokiran, kupovina parcele, naplata, ugovor, isto stanje posle restarta, bez duple isplate, zatvaranje bez zaostalih procesa (`evidence/phase6_2026-10-30/portable_exe`, `installed_exe`) |
| Deinstalacija | PASS: program uklonjen, profil u `%APPDATA%` netaknut |
| Restart Windows-a | NOT VERIFIED |
| Potpis | nije potpisano |
| Nađen problem | GPU proces Chromium-a se nije pokretao kad je putanja foldera bila duža od ~155 znakova (152 radi, 161 ne); aplikacija sada prikazuje poruku sa savetom; podrazumevana instalacija ima 60 znakova |

### Provera u Chrome-u (jedan server, jedan Chrome, privremeni profil)

Ekran je tokom sesije bio 1920×1080 na 59 Hz (na početku faze isti monitor: 2560×1440 na 180 Hz; režim je promenjen van ovog rada),
pa je FPS ograničen osvežavanjem.

| Stavka | Rezultat |
|---|---|
| FPS, test grad 3 min | prosek 59.9, min (1 s) 59.9, 1% low 59.5; vreme kadra prosek 16.68 ms, p99 16.8 ms; kadrova > 33/50/100 ms: 0/0/0 |
| FPS, Sheik`s City (496 objekata) | prosek 60.0, 1% low 59.3, 0 dugih kadrova |
| FPS, otvaranje i zatvaranje prozora | prosek 59.4, 1% low 31.2; 3 kadra > 50 ms (najduži ~100 ms) za 20 s — PARTIAL |
| Simulacija | 25,0 koraka/s u svim scenarijima |
| Animacije | prikazani kadar = kadar iz simuliranog vremena u 600 od 600 uzoraka (test grad, CPU 6×, Sheik`s City) |
| Promena FPS-a u igri | NOT VERIFIED u ovoj sesiji (CPU 6× nije smanjio FPS); pokriveno automatskim testovima i fazom 3 (180–300 FPS) |
| Memorija (JS heap) | 0 / 1 / 2 / 3 min: 37.7 / 31.5 / 32.2 / 32.6 MB; bez stalnog rasta; tekstura zastavice uklonjena posle oba preleta |
| 1280×720, 1920×1080 | PASS; na 1264 px širine buldožer na traci alata delimično odsečen (PARTIAL, nije poređeno sa originalom) |
| 2560×1440 | NOT TESTED (ekran 1920×1080) |
| Okvir čuda, „Not Enough Cash“, ugovor, rušenje, slika misije, dva preleta aviona, NPC gradovi | PASS (`evidence/phase6_2026-10-30/chrome/f*.png`, `npc_*_city.png`) |
| Save/load (ponovno učitavanje) | PASS: isto stanje, bez ponovne isplate, snimak validan |
| Zvuk | izlaz izmeren za muziku i 5 efekata (vrhovi 0,18–1,0); čujnost NOT VERIFIED (proveru je radio program, ne čovek) |
| Greške u konzoli | 0 |

### Nađeno i ispravljeno

- 73 predmeta (sva čuda, deo prodavnica i dekoracija) nisu imala sliku u prodavnici: njihov SWF nema simbol ikonice.
  `ItemDefinition.getIcon` gradi sliku iz simbola `normal`, pa `tools/fill_shop_icons.py` uzima prvi izvezeni kadar `normal`;
  test „every item with exported art has a shop icon“.
- `iconStyle` je bio dupliran za prodavnicu i skladište (propušten u fazi 5); spojen.
- `city=npc_boss` / `npc_advisor` prikazuje originalne NPC gradove (samo prikaz, sopstveni ključ snimka); test.

Testovi: 96/96 (`evidence/phase6_2026-10-30/tests.txt`).

## Faza 7 (2026-10-30 do 2026-11-04), vernost originalnom UI-ju

Dokazi su u `docs/evidence/phase7_2026-10-30/` (snimci ekrana i rezultati u `chrome/`). Poređenje sa originalom zasnovano je na
sedam snimaka koje je korisnik dostavio (original levo, HTML5 desno); originalna igra nije pokretana u ovoj fazi.

### Pronađeni originalni resursi i pravila

| Element | Original | Izvor |
|---|---|---|
| Traka komšija | `hud.swf` `friends_bar`, `hud_friend_box`, `hud_friend_box_add_friend`, `hud_friend_box_yourself`; 8 mesta po strani, rang po vrednosti firme, trake `position_1..3` | `FriendsBar`, `FriendsManager.npcsLoad` |
| NPC komšije | NPC koji nisu savetnici + sopstveni savetnik (`bossGenre`, `BOSS_COUNT` = 2): Ronald i Sheik; Cindy nije na traci | `RulesFacade.npcsIsAdvisor`, `npcsIsMyAdvisor` |
| Donje ikonice | `tool_panel`: `SpecialButton` (kofer, „Contractors“), `VaultButton` (poklon, skladište), `InvestButton` (grafikon, investicije) | `ToolsBar`, `TID_HINT_BUTTION_MULTIFUNCTION` |
| Podešavanja | `hud.swf` `options_panel`: zoomin, zoomout, fullscreen, music, volume, quality, options (zupčanik); isključeno = kadar 2 | `OptionsPanel.onMusicClick`, `onSoundClick` |
| Vrednost firme | `houses_info.swf` `popup_value` (i `_without_gold` samo uz Facebook kredite) | `PopupValue`, `Company.getCompanyValue*` |
| Klik na HQ | otvara `PopupValue`; prelaz mišem samo menja kursor (`CURSOR_HQ_01`), bez info-okvira | `StateOnHeadQuarter.doClick`, `doDoMouseOver` |
| Info-okviri na mapi | `houses_info.swf` `popup_info_house_*`, `popup_info_commerce_*`; kašnjenje 400 ms, uvod 0,35 s (Back.easeOut, skala 0,2), izlaz 0,25 s; vezan za predmet, levo kad desni izlazi van ekrana | `StateOnRent.doInfoBoxGetBox`, `InfoBoxHouse`, `InfoBoxCommerce`, `InfoBox.show`, `DCFillBar` |
| Specials i Skyscraper Week | `shop` `area_featured` (featured="1", 8 predmeta), `area_new_items` (`shopTab="new_items"`, 7 predmeta, istekli 16.01.2012), slika `feed/newitemimage.png` | `shopTabDefinitions`, definicije predmeta |
| Pozadina kartica | `shop_box` oblik `#16` (bitmap trave + gradijent) pod maskom; zeleni kvadrat je rezervisano mesto `icon` u dugmetu cene | `ItemContentUnlocked` |
| Mission Completed | `popup_well_done`; „Share success“ = zatvaranje kao Done + zahtev za Facebook objavu; slika `feed/<feedImg>`; kiša novčanica `NoteRain` (50 iza, 10 ispred, 5–15 px po kadru, +5° i +10° okretanja) | `PopupReward`, `MissionObjectManager.openReward`, `NoteRain` |
| Local Profile Settings | panel originalnog pokretača: ime igrača, ime grada, slika, dodavanje i oduzimanje novca, zlata i XP-a | `apps/server/src/launcherHtml.ts`, `serverApp.ts adjustLocalResources` |

### Implementirano

| Stavka | Status | Napomena |
|---|---|---|
| Traka komšija: 5 praznih „Add Neighbors“ mesta, igrač, Ronald, Sheik, rang, nivo, vrednost, strelice | PASS | prazna mesta i „Add Neighbors“ otvaraju poruku da prijatelji traže originalni server; nema izmišljenih prijatelja |
| Klik na NPC komšiju | NOT IMPLEMENTED | poruka „Visiting neighbour cities is not available in this version yet.“; poseta je stavka plana (offline podaci postoje) |
| Kofer (Contractors), grafikon (Investments) | BLOCKED (server) | originalna grafika; poruka o ograničenju bez simulacije |
| Poklon (skladište) | PASS | originalna akcija, postojeće skladište |
| Traka alata centrirana kao `ToolsBar.resize` | PASS | buldožer ceo vidljiv na 1280×720 (955–1013 px) |
| Podešavanja: zum +/−, ceo ekran, muzika, efekti, zupčanik | PASS | zum kroz postojeću kameru; muzika i efekti zaista utiču na `AudioEvents`; čuvaju se u `localStorage` (`mcity.settings.v1`) i važe posle ponovnog učitavanja |
| Dugme kvaliteta | izostavljeno | menja kvalitet Flash scene; WebGL nema odgovarajuće podešavanje |
| Local Profile Settings: okrugla bočna ikonica, otvaranje i zatvaranje jednim klikom, ime, grad, slika, novac/zlato/XP | PASS | pravila pokretača (ceo broj, do 999.999.999, ne ispod 0, vrednost firme prati novac i zlato); slika ostaje lokalno (PNG/JPEG/GIF/WebP do 512 KB) |
| Prodavnica: kartice sa originalnom travom, ikonica novca umesto zelenog kvadrata, zvezda i stara cena skrivene | PASS | ispravljen izvoz maske u `svgexport.py`; ikonica predmeta iznad sloja `image` |
| Specials | PASS | 8 predmeta po pravilima prodavnice (na nivou 3 zaključani po nivou) |
| Skyscraper Week | PASS | slika iz originala; predmeti prikazani kao zaključani jer je ponuda istekla 16.01.2012 (6 od 7 ima crtež) |
| Info-okvir kuće i prodavnice | PASS | stvarno stanje (vreme, traka, XP, novac, stanari ili kupci, crvene i zelene nule po originalu); ne blokira klik |
| Info-okvir prati kursor | odstupanje od zahteva | original ga vezuje za predmet (`InfoBox.show`), pa je zadržano originalno ponašanje |
| Info-okvir kuće koja čeka ugovor (`InfoBoxWonder`) i nepovezane kuće (`InfoBoxAbandoned`) | NOT IMPLEMENTED | bez okvira |
| Panel Type/Size/Position/Level/Income/Company Value | PASS | više se ne otvara za kuće, prodavnice ni HQ; ostaje za ostale objekte (dekoracije, čuda) |
| Klik na HQ → Company Value | PASS | Dollars, Gold, zgrade i dekoracije (sa troškom tekućeg ugovora), parcele i proširenja, ukupno |
| Kursor HQ-a | NOT IMPLEMENTED | |
| Mission Completed: slika misije, „Share success“, kiša novca | PASS | nagrada se isplaćuje jednom (i pri dvostrukom kliku); deljenje ne objavljuje ništa; kiša je samo prikaz i nestaje sama |
| Kiša i u prozoru novog nivoa | PASS | |
| Klik kroz HTML prozor na mapu | ispravljeno | Phaser prima i otpuštanje miša iznad HTML panela; tablu „Expansion for sale“ ispod dugmeta prozora je otvarao klik na dugme. Klik na mapu sada važi samo kada je meta platno |

### Ručna provera u Chrome-u (jedan server, jedan Chrome, privremeni profil, test grad)

Monitor 2560×1440 na 180 Hz; režim ekrana nije menjan. Prozor Chrome-a je tokom rada više puta minimizovan spolja; tada
stranica ne crta kadrove, pa skripta pre svakog koraka vraća prozor (prvi automatski pokušaji su zbog toga bili neuspešni i
sačuvani su u `regression_attempt2.json`).

| # | Provera | Rezultat |
|---|---|---|
| 1 | traka komšija | PASS (`01`, `16`) |
| 2 | donje ikonice | PASS / BLOCKED server (`11`, `12`, `13`) |
| 3 | Company Value | PASS (`04`) |
| 4 | podešavanja | PASS (`09`, `10`) |
| 5 | zum | PASS (1 → 0,5 → 0,75) |
| 6 | muzika uklj./isklj. | PASS (stanje `AudioEvents`, posle osvežavanja isto); čujnost NOT VERIFIED |
| 7 | efekti uklj./isklj. | PASS (`sfx()` vraća false kad su isključeni); čujnost NOT VERIFIED |
| 8 | Local Profile Settings | PASS (`14`, `15`, `16`) |
| 9–12 | Houses, Commerces, Decorations, Wonders | PASS (`05`, `27`, `28`, `29`) |
| 13 | Specials | PASS (`06`) |
| 14 | Skyscraper Week | PASS (`07`) |
| 15 | pozadine kartica | PASS |
| 16 | prelaz preko kuće | PASS (`03`) |
| 17 | prelaz preko prodavnice | PASS (`02`, levi okvir uz desnu ivicu `19`) |
| 18 | HQ prelaz i klik | PASS bez okvira; kursor NOT IMPLEMENTED |
| 19 | Mission Completed | PASS (`08`) |
| 20 | nagradna animacija | PASS (60 novčanica, gašenje posle zatvaranja) |
| 21 | zatvaranje svih prozora | PASS (prodavnica, skladište, vrednost firme, poruke, profil) |
| 22 | save/load | PASS (isto stanje posle ponovnog učitavanja, snimak validan) |
| 23 | zum i pomeranje mape | PASS (prevlačenje pomera kameru do granice mape) |
| 24 | rezolucije | PASS: 1280×720 (`17`–`19`), 1920×1080 (`20`, `21`), 2560×1440 (`22`, `23`) |

Snimci 01–03 su napravljeni u prozoru 1904×985 (pre podešavanja tačne veličine), a 01 pre ispravke učitavanja NPC-a.

Regresija (`chrome/regression.json`) daje sledeće. Parcela −1.000 $; ugovor potpisan (−97 $); kirija 402 $ jednom, drugi klik 0;
prodavnica 480 $ (2 kupca) jednom, drugi klik 0; dva uzastopna preleta aviona po 18,6 s, tekstura zastavice uklonjena;
NPC gradovi 402 i 496 objekata; save/load bez razlike; konzola bez grešaka i upozorenja (`console.jsonl` prazan).

### Preostale vizuelne razlike

- Aktivna kategorija prodavnice nije vizuelno istaknuta.
- Vrh info-okvira pokazuje na desnu ivicu crteža zgrade sa senkom, pa je okvir nekoliko desetina piksela desno od zida.
- Traka vremena u info-okviru je iznad sloja sjaja trake (taj sloj je u originalu iznad).
- „Contractors“, investicije, prijatelji i deljenje rade samo kao poruka o ograničenju.
- Vrednost firme u HUD-u je sačuvana vrednost; original je menja pri svakoj promeni novca i zlata (`Profile.set DCCoins`),
  a HTML5 ekonomija to ne radi, pa se HUD i prozor Company Value mogu razlikovati. Nije menjano u ovoj fazi (ekonomija).
- Ronald i Sheik imaju istu sliku jer su `Ronald.png` i `Sheik.png` u originalu isti crtež.

### Windows EXE 0.7.0

Napravljen posle uspešne provere u Chrome-u (`desktop/package.json` 0.7.0, isti Electron 44.10.0). Podaci o paketu su u
`docs/evidence/phase7_2026-10-30/package.json`. Verzija 0.6.0 je sačuvana kao referenca (`Millionaire City HTML5 0.6.0/`,
zip i instaler, SHA-256 isti kao u fazi 6).

| Provera | Rezultat |
|---|---|
| Portable EXE (`tools/exe_check.py`, privremeni profil) | PASS: pokretanje, NPC podaci, bez otvorenih portova, spoljni zahtev blokiran, parcela, ugovor, isto stanje posle restarta, čisto zatvaranje |
| Kirija u EXE-u | PASS posebnom proverom (`exe_0.7.0_rent.json`): 402 $ jednom, drugi klik 0. U `exe_check` koraku naplate nije bilo kuće sa kirijom jer početni grad čuva apsolutna vremena i pet dana posle faze 6 su ugovori istekli; to nije promena koda |
| Instaler | paket raspakovan (`/C /T`), `game.zip` jednak portable zipu (SHA-256), `install.ps1 -Target <privremeni folder> -NoShortcuts` instalira 0.7.0; instalirana kopija prolazi `exe_check`; privremeni folder obrisan |
| Instalacija u `%LOCALAPPDATA%` sa prečicama | NOT VERIFIED (nije pokretana da se ne menjaju Start meni i radna površina) |
| Sačuvane igre korisnika (`%APPDATA%\Millionaire City HTML5`) | nisu korišćene ni menjane |

### Integritet

32 zaštićena fajla (SHA-256), 579 originala i 417 vraćenih resursa (`manifest-v8`, 1.093 od 1.093) i 6 rezervnih kopija
snimka nisu promenjeni (`original_hashes_check_after.txt`, `integrity_after.txt`). Pravi snimak i profil korisnika nisu korišćeni.

### Testovi

`node --test tests/` daje 107/107 (11 novih u `tests/phase7_ui.test.mjs`), build i stroža provera tipova bez grešaka
(`tests_after.txt`, `tsc_build.txt`, `tsc_strict.txt`).

## Faza 8 (2026-11-04), integritet, offline funkcije, NPC posete, prodavnica i zum

Dokazi su u `docs/evidence/phase8_2026-11-04/` (`integrity/`, `shop/`, `chrome/`, `perf/`, `exe_0.8.0_*`).

### Integritet pre rada

| Provera | Rezultat |
|---|---|
| Arhiva 0.7.0 | nije obrisana: premeštena u folder `MillionaireCityHTML5-0.7.0-portable-win-x64/` i tamo raspakovana; SHA-256 isti kao zabeležen, raspakovana kopija bajt po bajt jednaka izgrađenoj 0.7.0 (1.190 fajlova) |
| `public/` naspram igre u 0.7.0 | 1.115 / 1.115 fajlova, 0 razlika |
| 0.6.0 folder naspram arhive 0.6.0 | 1.159 / 1.159, 0 razlika |
| Izvorni kod | prevodi se u isti JavaScript kao isporučen (razlikuju se samo `.map` fajlovi zbog putanje izlaza) |
| Originali | 32 zaštićena fajla, `manifest-v8` 1.093 / 1.093 (579 originala, 417 vraćenih), 6 rezervnih kopija snimka: nepromenjeni |
| Popravke | nisu bile potrebne |
| Rezervna kopija | `build/backups/phase8_start_20261104_0942.tgz` |

### Rezultati

| Stavka | Status | Napomena |
|---|---|---|
| Novi NPC gradovi | BLOCKED (nema podataka) | original ima samo dva offline grada; `universeFriend.xml` ne postoji |
| Poseta NPC gradu i povratak | PASS | klik na komšiju, originalni grad, natpis „offline NPC city“, avion, Go Home; sopstveni grad isti |
| Nadogradnja u poseti | PASS / PARTIAL | +100 $ +10 XP jednom po kući (`StateOnRentVisitor`, NPC nije partner); granice 5/12 h/1500 su pretpostavljene serverske vrednosti; Sheik`s City nema kuća u najmu u originalnim podacima |
| Super nadogradnja kod NPC-a | nije originalna | u originalu samo za partnere |
| Investicije | BLOCKED | original ulaže samo u Facebook prijatelje koji ne igraju (`getFriendsNoNeighbors`) |
| Contractors: Rent Collector, Contract Renewal | PASS | originalni prozori i ponude, plaćanje zlatom, oblast 11 × 11 |
| Contractors: Move | NOT IMPLEMENTED | dugme onemogućeno |
| Prodavnica: istekle ponude | PASS | kuće 126 (53 istekle), prodavnice 80 (37), dekoracije 138 (79), čuda 21 (5); lokalna opcija za kupovinu |
| Zelena podloga kartica | PASS | otključane: originalna trava; zaključane: ista trava pod originalnim plavo-sivim slojem |
| Zum 0,3 i 0,25 | PASS | 0,25 = `ToolsBar.ZOOM_MIN`; mapa centrirana kada je manja od prozora |
| Više lokalnih profila | PASS | dodatak desktop verzije |
| Regresija (parcela, ugovor, kirija, prodavnica, avion × 2, NPC, save/load, prozori, gradnja, rušenje) | PASS | `chrome/regression.json` |
| Klik kroz prozore na mapu | PASS | faza 7 zaštita i dalje važi |
| Konzola | PASS | `chrome/console.jsonl` |

### FPS, vreme kadra i memorija (`perf/perf_results.json`)

Chrome 156, prozor 1920 × 1080 (monitor 2560 × 1440 na 180 Hz, režim nije menjan), svaki scenario 180 s. FPS prikaza je
ograničen osvežavanjem ekrana; logika radi u koracima od 40 ms (25 koraka/s), a animacije objekata su originalnih 25 FPS.

| Scenario | FPS prosek | min 1 s | max 1 s | 1% low | p99 ms | > 33 / 50 / 100 ms | logika/s | JS heap MB (početak → kraj) |
|---|---|---|---|---|---|---|---|---|
| test_city_zoom1 | 180.0 | 177.0 | 180.7 | 172.8 | 5.7 | 0 / 0 / 0 | 25.0 | 104.2 → 96.7 |
| empty_city | 180.0 | 177.0 | 180.8 | 172.2 | 5.7 | 0 / 0 / 0 | 25.0 | 95.5 → 97.1 |
| npc_sheik_city_496 | 179.9 | 176.0 | 180.4 | 165.5 | 5.7 | 0 / 0 / 0 | 25.0 | 96.6 → 47.5 |
| npc_chocolate_fields_zoom025_pan | 179.8 | 156.1 | 180.3 | 161.3 | 5.7 | 2 / 1 / 1 | 25.0 | 62.9 → 68.4 |
| npc_chocolate_fields_zoom1_pan | 180.0 | 177.0 | 180.4 | 172.4 | 5.7 | 0 / 0 / 0 | 25.0 | 67.5 → 53.9 |
| test_city_windows | 179.5 | 131.5 | 180.0 | 137.5 | 5.7 | 4 / 2 / 2 | 25.0 | 72.6 → 50.7 |

Retki dugi kadrovi su pri učitavanju ili zatvaranju prozora i pri pomeranju na zumu 0,25. Memorija na kraju scenarija
(`perf/memory_by_process.tsv`): proces igre (renderer) oko 450 MB privatne memorije, GPU proces 746 MB radnog skupa i do
4,8 GB rezervisane (commit) memorije drajvera; JS heap ostaje 50–110 MB bez stalnog rasta. Rezolucije 1280 × 720,
1920 × 1080 i 2560 × 1440 (ceo ekran) proverene su snimcima (`chrome/res_*.png`, `zoom_*.png`).

### Windows EXE 0.8.0

| Provera | Rezultat |
|---|---|
| Paketi | `dist/windows/Millionaire City HTML5/` (portable), `MillionaireCityHTML5-0.8.0-portable-win-x64.zip` (SHA-256 `f8fe9520…`), `MillionaireCityHTML5-0.8.0-setup-win-x64.exe` (`3c9cd39e…`) |
| Sačuvane verzije | 0.6.0 (folder, zip, instaler) i 0.7.0 (folder `Millionaire City HTML5 0.7.0`, korisnikov raspakovani folder sa zipom, instaler); heševi isti kao ranije |
| Izmena Electron-a | dozvola samo za `fullscreen` sa `app://mcity/` (dugme za ceo ekran nije radilo jer su sve dozvole odbijane); sve ostalo i dalje odbijeno |
| Lokalni server | nije potreban: igra se služi kroz `app://`, bez porta, pa nema servera koji se pokreće ili gasi |
| Portable i instalirana kopija (privremeni folder), `exe_check` | PASS: bez otvorenih portova, spoljni zahtev blokiran, parcela, ugovor, stanje posle restarta, čisto zatvaranje |
| Funkcije faze 8 u EXE-u (`exe_0.8.0_features.json`) | PASS: zum 0,25; prodavnica 126 kuća (53 istekle); Rent Collector (proba) 402 $, drugi klik 0; poseta Chocolate Fields +100 $ jednom i povratak; novi profil i povratak; ceo ekran uključen i isključen; 0 grešaka; 0 zaostalih procesa |
| Instalacija u `%LOCALAPPDATA%` sa prečicama | NOT VERIFIED (nije pokretana da se ne menjaju Start meni i radna površina) |

## Faza 9 (2026-11-04), ispravke sa ručnog testiranja 0.8.0

Dokazi: `docs/evidence/phase9_2026-11-04/` (`integrity/`, `chrome/` sa `zoom/`, `functional/`, `regression/`, `resolutions/`, `shop/`, `perf/`, `exe_0.9.0_*`). Napredak i uzroci: `docs/phase9_progress.md`. Rezervna kopija pre rada: `build/backups/phase9_start_20261104_1647.tgz`.

| Problem | Status | Uzrok | Rešenje | Test | Dokaz |
|---|---|---|---|---|---|
| Nepoznati krug na mapi | PASS | `.profile-toggle`, neoznačeno okruglo dugme Local Profile Settings (dodatak faza 7 i 8) na sredini leve ivice; nije joystick, touch ni debug kod (takav kod ne postoji u `src/`) | dugme sa natpisom „Local Profile“ gore na sredini, gde original nema elemenata | `phase9.test.mjs` „desktop page“ | `chrome/zoom/*.png` |
| Prozor Select Contractor mali | PASS (nije original) | prozor je crtan za Flash stage 760×600 | uvećanje oko centra do 1,5× (atlas je 2×) uz 150 px slobodno za HUD; originalna veličina na malim prozorima | „contractor popup“ | `functional/contractors_*.png`, `resolutions/` |
| Special Offer oznaka | PASS | zeleni krug je originalna značka; izvoz rasporeda nije čuvao rotaciju polja (−17°), pa je tekst stajao iznad nje | `svgexport.py` čuva matricu rotiranih polja, `SwfPanel` je primenjuje; tekst se ne skuplja (`ItemService`) | „Special Offer“ | `functional/contractors_select_contractor_1920.png` |
| Otkazivanje ugovora | PASS | — | po originalu (`StateOnRent.doDoClick`): levi klik na kuću u najmu, `PopupConfirmDestroy` sa `TID_CANCEL_CONTRACT`, zatim `MODE_CANCELING_CONTRACT` 3000 ms i čekanje novog ugovora; bez povraćaja. Nije RMB. Provera povezanosti sa HQ ne postoji u motoru | 2 testa | `functional/cancel_contract_confirm.png`, `phase9_checks.json` (stanje posle ponovnog učitavanja: čeka ugovor) |
| Mapa „fiksirana“ na najmanjem zumu | PASS (odstupanje) | mapa 2886×2467 je na 0,25–0,4 manja od Full HD prozora; i original (`Map.onZoom`) je tada centrira i ne pomera | mapa se pri zumu centrira, a posle može da se prevlači dok god je cela vidljiva | „camera“ | `zoom/after_zoom025_*.png` |
| Bela površina oko mape | PASS (nije original) | Phaser i stage su beli (`ffffff`, i u originalu) | ivice pozadine produžene prosekom ivičnih redova i kolona; tamni sloj nekupljenih parcela se nastavlja | „map surround“ | `zoom/after_zoom025_dragged.png` |
| Bela strana pri prelasku u drugi grad | PASS | svaki prelaz ponovo učitava stranicu; dok se grad učitava, videla se prazna bela stranica | originalni ekran učitavanja `pages/Background_loading.png` od prvog iscrtavanja do kraja `create()` | 35 prelaza (Own→Ronald→Own, Own→Sheik→Own, Own→Ronald→Sheik→Own, pet puta): svaki je prikazao ekran učitavanja; sopstveni grad isti | `phase9_checks.json` `switches` |
| Natpisi tabli u serifnom fontu (nađeno usput) | PASS | scena nije čekala fontove; Phaser tekst ostaje u zamenskom fontu | `main.ts` učitava fontove iz `fonts.css` pre scene (najviše 3 s) | Chrome | `functional/expansion_signs_font.png` |
| Company Value u HUD-u | PASS | sačuvana vrednost se menjala samo pri kupovini usluge | računa se originalnom formulom (`Company.getCompanyValue`) pri svakom osvežavanju, što je jednako originalnim pomacima (`Profile.set DCCoins/DCCash`, kupovina, rušenje, ugovor, teren) | kirija +402 $, vrednost +312 (završava se ugovor od 90 $), HUD isti | `functional/company_value_after_rent.png` |
| HUD vlasnika tokom posete | PASS | — | `HudOwner.onUpdate`: vrednost NPC vlasnika (Ronald 100.000.000, Sheik 900.000.000) | Chrome | `functional/visit_*_owner_hud.png` |
| Prodavnica: podloga svih kategorija | PASS | zaključane kartice: originalni `shop_box_locked` (oblik #63) pokriva celu travu slojem (101,151,182) od 80 %, i to se zadržava. Stvarne razlike: slika zaključanog objekta nije imala `alpha 0.5` (`ItemContentLocked.setupIcon`), a čuda nisu koristila `shop_box_wonder` | obe razlike ispravljene | 379 kartica u 6 lista (Houses 126, Commerces 80, Decorations 138, Wonders 21, Specials 8, Skyscraper Week 6), 3 prolaza (nivo 3; istekle ponude uključene; sve otključano). Zaključane: izmerena boja = trava×0,2 + sloj×0,8 (odstupanje ≤ 3) | `shop/shop_audit.json`, 49 snimaka po prolazu |
| Skladište otvaralo prazan „Shop“ | PASS | skladište je koristilo prozor prodavnice | originalni `PopupStorage` (`Storage.swf`), `TID_STORAGE_EMPTY`, kartice `storage_box`, 4 po strani, Use | „storage“ | `functional/storage_*.png` |
| Buy Expansion: prazna srednja kolona | PASS | — | originalni `box_invest_pending` i dugme „Invest“ (investicije ostaju BLOCKED) | Chrome | `functional/expansion_popup.png` |
| Contractors Move | PASS | — | po `ToolMove`: klik na sopstveni pokretni objekat (ne HQ; kuće koje čekaju ugovor, u najmu ili napuštene), nošenje, isto mesto znači odustajanje, zabranjeno mesto ne radi ništa; uz uslugu `move` `PopupConfirmMove`, inače `PopupPayMove`: cena `movePriceCoins` + timePrice(nivo) × minuti gradnje × min(`instantBuildFactor`, 1), ili Rent 10 zlata za 24 h | 5 testova; Chrome: plaćeno 13.406 $, zatvaranje prozora ostavlja objekat na mestu, Rent −10 zlata pa besplatno; pozicija ista posle ponovnog učitavanja | `functional/move_*.png` |
| Prozori dobrodošlice za usluge | nije originalno ponašanje | `PopupServicePresentation` (`popup_wellcome_crane_operator`) original pravi, ali ga nigde ne prikazuje; tekstove ima samo za Move | ne dodaje se | — | `phase9_progress.md` |

Zaokruživanje cene pomeranja (`Math.floor`) i izostanak provere povezanosti sa HQ pri otkazivanju su pretpostavke.

### Regresija, performanse, EXE

- `tools/phase7_regression.py`: parcela, ugovor, kirija 402/0, prodavnica 480/0, dva aviona, save/load jednak, zatvaranje prozora, NPC 402/496: sve PASS (`chrome/regression/`).
- Performanse, 6 scenarija × 60 s, 1920×1080, 180 Hz: prosečno 178–180 FPS, p99 kadra 5,7 ms, logika 25 koraka/s; memorija u opsegu faze 8 (`perf/perf_results.json`).
- EXE 0.9.0, portable i instaliran u privremeni folder (`install.ps1 -Target -NoShortcuts`; `game.zip` u instaleru jednak portable ZIP-u):
  - `exe_check`: offline, bez portova osim test DevTools, parcela, ugovor, stanje posle restarta, čisto gašenje;
  - `exe_features`: zum, prodavnica 126/53, Rent Collector 402 pa 0, otkazivanje, Move 13.406 $, skladište, poseta +100 pa 0, profili, ceo ekran, 0 grešaka;
  - obe provere: PASS. Instalacija u `%LOCALAPPDATA%` sa prečicama: NOT VERIFIED.
- Alati za EXE sada vraćaju skriven prozor preko `ShowWindow`, jer Electron nema `Browser.getWindowForTarget`. Bez toga skriven prozor ne iscrtava kadrove i klikovi ne stižu do igre.

| Artefakt | SHA-256 |
|---|---|
| `MillionaireCityHTML5-0.9.0-portable-win-x64.zip` | `22837465fed2fb9a91697c1c260663615e822fc29e8c985d63163217ab851353` |
| `MillionaireCityHTML5-0.9.0-setup-win-x64.exe` | `866fce4ca1527f5b0ee1ab4c734abe540eddec97a90d819530d8034b81b1af5b` |

**Prethodne verzije:** heševi 0.6.0, 0.7.0 i 0.8.0 isti su kao pre rada (`integrity/release_hashes_*.txt`). Folder 0.8.0 je pre izrade proveren prema svom ZIP-u (1196/1196 isto) i preimenovan u `Millionaire City HTML5 0.8.0`, kao ranije 0.7.0.

**Originali:** 32/32, `manifest-v8` 1093/1093, 6/6 rezervnih kopija snimka.

## Testovi

`node --test tests/`: 131/131 (`evidence/phase9_2026-11-04/tests_after.txt`); build i stroga provera tipova bez grešaka.
