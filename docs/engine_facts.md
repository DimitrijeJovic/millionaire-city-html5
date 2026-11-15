# Utvrđene činjenice o originalnom klijentu

Izvor: AVM2 kod `Dollars.private.swf` (rastavljen sopstvenim alatom, samo čitanje) i XML pravila.
„Provereno“ znači potvrđeno i poređenjem sa snimkom originala u laboratoriji.

| Činjenica | Izvor | Status |
|---|---|---|
| Mreža je pravougaona, polje 32×32 px | `mapDefinition.xml`, `Map.getTileXToWorld` | provereno |
| Mapa 6×6 oblasti po 15×10 polja = 90×60 | `MapDefinition.build`, `expansions.xml` (36 oblasti) | provereno (ceo prikaz na zumu 0,4) |
| Relativne koordinate iz snimka: polje = x + 45, y + 30; dodatnih gornjih redova nema | `Map.getTileRelative*ToTile`, `Map.setTileData` | provereno |
| Zgrada: tačka registracije simbola je donji levi ugao osnove (`y = baseRows·32`) | `ItemObject.buildResources` | provereno |
| Podrazumevano se koriste simboli `normal_new` (`Config.USE_OLD_ITEM_DESIGNS = false`) | `ItemDefinition.getItemDesignClass` | provereno |
| HQ: `HQDecorations/HeadQuarter_01.swf`, simbol `Asset_new` | `skinDefinitions.xml`, snimak | provereno |
| Pozadina: bitmapa 2886×2467 iz `terrain.swf` (simbol `background`) na (0,0) | `Background.load` | provereno |
| Autotiling: 8 suseda → oblik 0–46; vrednost = oblik + [14, 62, 1][tip]; crta se indeks vrednost−1 iz `tileset.png`, 0 briše polje | `Map.getTileTerrainForm`, `Map.<init>`, `Background.build` | provereno |
| Pešački prelazi oko oblika 16, 17, 19, 20 (ne 18) | `Map.checkCrossWalk` | provereno |
| Zum: nivoi [1; 0,75; 0,5; 0,4], korak 0,05 po kadru od 25 FPS | `OptionsPanel` konstante, ranija analiza | kod |
| Animacije zgrada: 1 kadar po logičkom koraku (25/s) | `BitmapAnimation.update`, `ItemObject.logicUpdate` | kod |
| Iznajmljena kuća (mode 4) prikazuje prvi kadar | snimak originala | provereno |
| Obris pri hoveru: boja 0xFFFF33 | `ItemObject.GLOW_COLOR` | kod |
| Logički ekran 760×594 | `Config.SCREEN_WIDTH/HEIGHT` | kod |
| Zvučni događaji (gradnja, rušenje, ugovor, prihod, nivo, muzika) | `research/millionaire_city/event_asset_map.csv` | ranije istraživanje |
| Kuća: stanja 1 čeka ugovor, 2 potpisivanje (3 s), 4 izdaje se, 5 kirija spremna, 7 napuštena; `time` = preostalo ms od `savedAt` | `StateOnRent.<cinit>`, lokalni server `timers.ts` | kod + test |
| Rok napuštanja = max(trajanje ugovora × 100 %, 60 min) | `settings.xml`, server `getAbandonTimeMs` | kod (server) |
| Kirija = (prihod definicije + `incomeCoins` ugovora) + floor(× uticaj %/100); XP = definicija + ugovor | `ItemObject.getIncomeValue`, `getIncomeXP` | kod |
| Uticaj: oblast = osnova ± `influenceRatio`; kuća sabira `influenceValue` dekoracija | `influenceLoopNeighbours`, `registerItemInfluence` | kod |
| Cene, prihodi i XP ugovora su celi brojevi (97,5 → 97) | `EncryptionUtils.encryptCustom` | kod + test |
| HUD: bez FC kao valute FC je skriven, a novac i zlato pomereni za širinu FC | `HudOwner.load` | provereno |
| Natpisi dugmadi se smanjuju do 10 px dok ne stanu (margine 4/2) | `TextManager.setTextScaled` | provereno |
| Traka iskustva: širina 1 + napredak × (bar_size − 1), rast 0,1 px/ms | `DCFillBar` | provereno |
| Ikonice: kirija `daily_bonus.swf:Event_rent`, naplata `Event_rent_ok`, ugovor `contract_event.swf` | `ModelConfig`, `ItemObject.setIcon` | kod; ikonica ugovora delimično zaključena |
| Prodavnice: `incomeTime` je u minutima (ostalo u satima); bez kupaca tajmer kreće ispočetka; spremna kirija bez kupaca vraća se u izdavanje; nema napuštanja | `ItemDefinition.set incomeTime`, `StateOnRent.doDoLogicUpdate` | kod + test |
| Kupac prodavnice: kuća u oblasti (osnova ± `influenceRatio`) u stanju 4 ili 5; prihod = Σ `incomeValue` × `tenants` | `StateOnRent.isAffectedByType`, `onIncome`, `getIncomeValue` | kod + igra (280 $ = 40 × 7) |
| Ikonice stanja: PNG trake 75×75 (`rentIcon`, `contractIcon`, `CommerceTypes/icons/<sku>.png`), kadrovi 0‑1‑2‑3‑2‑1 po 150/130/130/150/130/130 ms, centrirane na osnovu | `StateOnRent.setAnimationRent`, `TopLayer` | provereno (referentni snimak) |
| Postavljanje: osnova u mapi i kupljenoj oblasti, polja bez objekta i puta; kuće i prodavnice samo na kupljenom terenu, dekoracije bilo gde | `Map.isBuildable`, `ItemDefinition.requiresTerrainMine` | kod + test |
| Zaključavanje: `unlockCondition` level / fan / cross | `ItemDefinition.isLocked` | kod |
| Gradnja: `constructionCoins`/`constructionCash`, `constructionTime` u minutima, završetak klikom na `Event_Contract_anim`; zvuk `Build_Sound` pri postavljanju | `ToolBuild.startBuildingItem`, `StateOnConstruction`, `NotificationConstructionEnd` | kod + test |
| Teren: cena `terrainPrice` za nivo, rušenje vraća 100 %; put je besplatan, bez zvuka, preko parcele je uklanja | `Map.buyTerrain`, `destroyTileApplyEconomy`, `roadTileBuild` | kod + test |
| Rušenje: povraćaj trunc(vrednost × 35 / 100); zvuk buldožera osim za dekoracije | `settingsGetDestroyItemProfit`, `ItemObject.onAccept` | kod + test |
| Prodavnica: kartice Houses/Commerces/Decorations/Wonders; 8 okvira po strani (4×2, x −190,3 + 135·k, y −105 + 190,1·r); cena „60,000“, preko 7 cifara „12M“ | `BuyBox`, `TextManager.convertNumberToString` | kod + test |
| Filter prodavnice: bez HQ, `where` bez „shop“, `freeGift`, isteklog `expireTime` i neobjavljenog `releaseTime` | `ItemDefinition.isAllowedToBeInShop` | kod + test |
| Misije: 87 osnovnih (231 u „alt_missions“ A/B grupi se ne koristi); stanja LOCKED → UNLOCKED → REACHED → GIVEN; brojači `type+parameter`; uslovni pragovi se broje jednom, redom | `MissionObject`, `PollManager`, `PollEvent` | kod + test; stanja stvarnog snimka se reprodukuju |
| Ključevi događaja: gradnja `build`+nameType / nameType_subtype / sku; naplata `collect`+`Houses%<vreme ugovora>` / nameType / sku | `ItemObject.registerEvent`, `StateOnRent.onIncome` | kod + test |
| Saobraćaj: provera svakih `spawnAskForANewAgentTime` (10 s); limit max(min(parcele, 20), 3); verovatnoća 100 % do 3 vozila, zatim opada; najmanje 3 polja razmaka; vozila sa `spawnCondition` samo uz tu zgradu | `TrafficAgentManager.spawnLogicUpdate`, `trafficAgent*.xml` | kod + test |
| Vozilo: max brzina `speed/1000` px/ms, ubrzanje 0,0001 px/ms², kadar = ugao u stepenima (360 kadrova), bledenje 1000 ms, istek `agentExpireTime` minuta | `TrafficAgent.setup`, `movementSetRotation`, `logicUpdate` | kod + test |
| Avion: `PLANE_SPEED` 5 px po kadru, `plane_04` je animirani; okidač nije pronađen | `Plane` | kod |
| Proširenja: 25 parcela iz `expansions.xml`; stanja 0/1/2 (zaključano / na prodaju / kupljeno); kada se kupi ceo red `unlockedOrder`, otvara se sledeći | `Map.buyPlot`, `Plot.<cinit>` | kod + test |
| Cena proširenja: red iz `expansionsPrices.xml` sa indeksom (kupljene parcele − 1); novac `DCCoins` ili zlato `DCCash`; treća opcija traži `InversorsSuccessful` | `Profile.set plots`, `PopupConfirmExpansion.showPopup` | kod + test |
| Prikaz: nekupljene parcele zatamnjene (crno, 30 %), znak `popup_for_sale_expansion` u centru, katanac za zaključane | `Background.createExpansions` | kod + igra |
| Čvrste pločice: `rules/universe/map.xml` `LogicTiles` „tip:x:y“, tip 0 = `LogicTileSolid` → `TileData.isSolid` | `Map.build`, `LogicTileSolid.build` | kod + test |
| `nameCity`: `PopupName.saveName` menja ime, misiju stavlja u REACHED i pokreće avion sa imenom | `PopupName.saveName` | kod + igra |
| Avion: `Plane.start(ime)` posle preimenovanja i pri ulasku u tuđi grad; start na desnoj ivici, y = `getBottomY`/2, ulevo 5 px po kadru | `DollarsGame.changeState`, `Plane.logicUpdate` | kod + igra (preimenovanje) |
| Posete: pri ulasku u tuđi grad `visitFriend` (ili `visitRonald`), `visitPartner` za partnere i uvek `visitCity` | `DollarsGame.changeState` | kod |
| Nadogradnja u poseti: klik na kuću → `upgrade` događaji (`ItemObject.registerEvent`), +100 $ i +10 XP, najviše 5 predmeta po poseti, ponovo posle 12 h | `StateOnRentVisitor.doDoClick`, `social.xml` | kod |
| `collectUpgraded` pri naplati kuće koju je nadogradio prijatelj; `investment` i `investmentDone` pri zatvaranju prozora investicije | `StateOnRent.onIncome`, `PopupInvestSuccess/Fail.close` | kod |
| Skladište: gomile sa brojem komada; postavljanje skida jedan komad i preskače proveru cene | `StorageManager.removeItem`, `ToolBuild.reportMouseUp` | kod + test |
| Smer automobila: kadar = `atan2(y, x)` u stepenima u koordinatama ekrana (nadole = 90) | `TrafficAgent.movementSetCurrentDirection` | kod |
| Izbor ugovora: `ContractBox` iz `contracts.swf`; 6 po strani, slot n na (−114 + 114·(n mod 3), −80 + 147·⌊n/3⌋) posle pomeranja scroll okvira; zaključan ako je nivo ugovora veći od igračevog | `ContractBox.<init>`, `getItems`, `addItem`, `ContractItem.viewBuild` | kod + igra |
| `houses_info.swf` `popup_contract` pripada `PopupMultiContract` (kupovina usluge „contract signator“), a ne izboru ugovora | `PopupMultiContract.<init>`, `getItems` | kod |
| Naziv ugovora: `TID_CONTRACT<n>`, n = redni broj imena u `contractsNames.xml` | `ContractDefinition.build`, `ActionGetDefinitions.itemFromXML` | kod + locale |
| Potvrda rušenja: klip `PopupDestroy` ugrađen u klijent; `TID_DESTROY_MSG` sa iznosom `destroyItemProfitPercentage` % vrednosti, ili `TID_DESTROY_BUILDING_NOREWARD`; vlasnik uvek potvrđuje (`Role.demolitionConfirmationRequired`) | `ItemObject.demolish`, `PopupConfirmDestroy.showPopUp` | kod + igra |
| `TextManager.convertNumberToString`: `TRUNCATE_THOUSAND` deli sa 1000 („K“) pa ponovo za ≥ 1000 („M“); vrednosti < 10 sa razlomkom imaju 2 decimale, ostale 0 | `TextManager.convertNumberToString` | kod + test |
| `TextManager.convertTimeToString(ms, true)`: dani; inače sati i minuti, ili minuti i sekunde; sa trećim argumentom dani + sati | `TextManager.convertTimeToString` | kod + test |
| Info-okviri: ugovor `contracts.swf` `popup_info_box_*`; prodavnica `hud.swf` `popup_info_box_*`, `_commerce_*`, `_decoration_*`; desni, a levi kad desni izlazi van ekrana; kašnjenje 200 ms | `InfoBoxContract`, `ShopMenuInfo*`, `InfoBox.show`, `ItemContent.TOOLTIP_DELAY` | kod + igra |
| Slika misije samo uz `imageIsRequired`: `Assets/missions/<type>_<parameter>.swf` (beat: `<type>_<condition>`), simbol `image`; `TextInfo` slike = uslov (bonus: procenat) | `MissionDefinition.getSkuToLoad`, `MissionDefinition.build`, `PopupMission.<init>` | kod + igra |
| Zastavica aviona: bitmap klipa `Tail` na (tail.x − 20, tail.y), 20 traka, `start(20, 4, 0.01, 0.002)`, `updateWaveFlag(dt)` sa vremenom kadra | `Plane.start`, `Plane.logicUpdate`, `Flag` | kod + igra |
| Nadogradnja u poseti dodaje događaje istim redom kao naplata: `upgrade` + nameType, + nameType_subtype, + sku | `StateOnRentVisitor.doDoClick`, `ItemObject.registerEvent` | kod + test |
| Offline režim: korisnik 0 → `universe.xml`; poslednji NPC (`isBossNPC`) → `universeAdvisorCity1_AbuDabhi.xml`; ostali NPC → `universeAdvisorCity.xml`; ostali → `universeFriend.xml` | `UserDataFacadeOffline.requestTask`, `ModelConfig.<cinit>` | kod + fajlovi |
| Nadogradnje: vrednosti po tipu (`UPGRADE_TYPE_NORMAL` 100 $/10 XP/10 %, `UPGRADE_TYPE_SUPER` 150 $/15 XP/12 % za partnere); broj po poseti stiže kao `upgradesUniverseAvailable` i smanjuje se po nadogradnji | `RulesFacade.socialLoadOnComplete`, `UpgradesManager.setNeighborId`, `load`, `upgradeItem` | kod |
| Investicija: prijatelj iz serverske liste, uspeh kada je gotova i vrednost firme prijatelja ≥ `target`; nagradu obračunava server | `InvestManager.investInFriend`, `applyInvestmentDone`, `InvestObject.isSuccesfully` | kod |
| Nedovoljno novca za ugovor: `PopupConfirm` (`popups/confirm/popup_confirm.swf`); zlato → ponuda zamene, inače Facebook krediti | `ContractBox.onContract`, `PopupConfirm.startExchangeGold`, `startAskForHelpFBCredits`, `startNoAction` | kod |
| `plane_04` = `plane_show.swf` „plane“ (276 kadrova) na (1528, 933), uklanja se na poslednjem kadru; ostali avioni iz `plain.swf` (`plain`, `plane_02..04`) sa zastavicom | `Plane.setPlane`, `Plane.start`, `Plane.logicUpdate` | kod |
| Info-okvir čuda: `popup_info_box_wonder_*`, polja `TopText`, `Size`, `plots`, `Time`, `Time_Number`, `Text` | `ShopMenuInfoWonder` | kod + test |
| `upgrade_maximunOf_items`, `upgrade_repeatUpgrades_time`, `maxUpgradesPerDay` iz `social.xml` klijent ne čita | `RulesFacade.socialLoadOnComplete` | kod |
| Kupci prodavnice zavise samo od stanja kuća; u koraku prodavnica menja se samo stanje prodavnica, pa jedan snimak stanja kuća važi za sve prodavnice | `StateOnRent.isAffectedByType`, `StateOnRent.doDoLogicUpdate` | kod + test (faza 5) |
| Traka komšija: 8 mesta po strani, rang po vrednosti firme; NPC na traci su svi koji nisu savetnici i sopstveni savetnik (`bossGenre`); prvih `BOSS_COUNT` = 2 NPC-a su savetnici | `FriendsBar`, `FriendsManager.npcsLoad`, `RulesFacade.npcsIsAdvisor`, `npcsIsMyAdvisor` | kod + igra (faza 7) |
| `OptionsPanel`: zoomin, zoomout, fullscreen, music, volume, quality, options; isključena muzika/efekti = kadar 2; zupčanik skriva i prikazuje red | `OptionsPanel.onMusicClick`, `onSoundClick`, `onOptionsClick` | kod + igra (faza 7) |
| Klik na HQ otvara `PopupValue`; prelaz mišem menja samo kursor (`CURSOR_HQ_01` + skin), info-okvira nema | `StateOnHeadQuarter.doClick`, `doDoMouseOver` | kod |
| Vrednost firme = novac + zlato × `cashToCoins` + Σ (vrednost predmeta + cena tekućeg ugovora) za predmete koji mogu da se prodaju (ne u izgradnji) + pločice terena × cena terena nivoa + Σ kupljenih proširenja `DCCash × cashToCoins` | `Company.getCompanyValue*`, `ItemObject.getCompanyValue`, `Profile.getCompanyValuePerExpansions`, `RulesFacade.expansionsGetDCCoinsWithFriends` | kod + test (faza 7) |
| Promena novca ili zlata menja i sačuvanu vrednost firme za istu razliku (zlato × `cashToCoins`) | `Profile.set DCCoins`, `Profile.set DCCash` | kod |
| Info-okvir na mapi: kuća `popup_info_house_*` (osim kuće koja čeka ugovor: `InfoBoxWonder`; nepovezana: `InfoBoxAbandoned`), prodavnica `popup_info_commerce_*`; kašnjenje 400 ms; tween 0,35 s ulaz (skala 0,2, Back.easeOut) i 0,25 s izlaz; desni okvir na desnoj ivici predmeta, levi na levoj kad desni izlazi van ekrana | `StateOnRent.doInfoBoxGetBox`, `InfoBox.show`, `InfoBox.<cinit>` | kod + igra (faza 7) |
| Polja info-okvira kuće: `Status` „Tenants:“, `IncomeIn` = `convertTimeToString(t, false, true)`, `DailyXP` (0 crveno), `DailyIncomeMoney` (0 zeleno), `attendance_number` (0 zeleno); prodavnice: `Income_Bonus`, `attendance` „Customers:“, `IncomeIn` = `convertTimeToString(t, false)`, nule crvene | `InfoBoxHouse`, `InfoBoxCommerce` | kod + test |
| `convertTimeToString(t, false)`: ispod sata uvek „M Mins S Secs“, i sa nulom | `TextManager.convertTimeToString` | kod + test |
| `DCFillBar`: dete `bar` dobija širinu MIN_WIDTH (1) + udeo × (širina `bar_size` − 1) | `DCFillBar.setValue` | kod |
| Broj stanovnika: kuća sa ugovorom ima `tenants` definicije; prodavnica zbir stanovnika kuća-kupaca | `ItemObject.getPopulation` | kod |
| `PopupReward`: „Share success“ (`TID_BUTTON_SHARE`) zove `onClose` pa traži Facebook objavu; slika je `feed/<feedImg>` misije | `PopupReward.onShare`, `showPopup`, `loadImage` | kod |
| `NoteRain`: pozadina 50, prednji plan 10 novčanica; tip po sloju (pozadina Note2–Note3, prednji Note–Note1); brzina 5 + rand × 10 px po kadru, rotationZ +5°, rotationX +10°; početak y = −(h + 10) − rand × H/2, x = rand × (W + 200) − 100; nestaje ispod H + H/4 | `NoteRain.createNewPartilce`, `update` | kod + test |
| Specials = definicije sa `featured="1"`; Skyscraper Week = `shopTab="new_items"`, slika `feed/newitemimage.png` | `shopTabDefinitions`, definicije | podaci + igra |
| Zeleni kvadrat na dugmetu cene u prodavnici je rezervisano mesto `ButtonText/icon` za ikonicu valute; `offer` i `old_prize` su za popuste | `shop_box` u `shop.swf` | SWF + igra |
| Najmanji zum originala: `ToolsBar.ZOOM_MIN` = 0,25 (nivoi zuma 1 / 0,75 / 0,5 / 0,4) | `ToolsBar.<cinit>` | kod |
| Poseta: klik na kuću posetioca radi samo ako `isAnyUpgradeAllowed`, kuća je u `MODE_RENTING`, nije već nadograđena i `ItemDefinition.isUpgradeAllowed` (kuće, ne HQ); animacija `CommerceTypes/upgrades.swf` `Event_upgrade` (partner: `super_upgrades.swf`) | `StateOnRentVisitor.doIsMouseOverEnabled`, `doDoClick`, `upgradeDoSetDOs` | kod + igra (faza 8) |
| Offline NPC gradovi: samo `universeAdvisorCity.xml` (savetnik, Ronald ili Cindy po `bossGenre`) i `universeAdvisorCity1_AbuDabhi.xml` (Sheik); `universeFriend.xml` ne postoji. U Sheik`s City sve kuće čekaju ugovor (129 × mode 1), pa nema kuća za nadogradnju; Chocolate Fields ima 21 kuću u najmu | `UserDataFacadeOffline.requestTask`, XML fajlovi | kod + podaci |
| Investicije: lista za ulaganje je `FriendsManager.getFriendsNoNeighbors()` (prijatelji koji nisu komšije); NPC su komšije i nikad nisu ponuđeni | `InvestManager.friendsToInvestPopulate`, `PopupInvest.getFriends` | kod |
| Usluge (Contractors): `ItemService.onContract` sam naplaćuje zlato (`delayedPaymentSetGold`), `Profile.servicesContract` postavlja vreme na sada + `timeDuration` sati (ponovna kupovina zamenjuje preostalo vreme); `timeExpired` sati čekanja posle besplatne probe | `ItemService`, `Profile.servicesContract`, `ServiceDefinition.fromXML` (`hourToMs`) | kod + test |
| Oblast usluga: `settings.xml` 11 × 11; `areaSetSize`: start = −(w >> 1), još −1 za neparno, kraj = −start, pločice start ≤ t < kraj (−6..5); boja `AREA_COLOR` 0x00FF00, alfa 0,1–0,4 korakom 0,01 | `Tool.areaSetSize`, `areaMove`, `areaDraw`, `areaLogicUpdate` | kod + test |
| Rent Collector skuplja predmete sa spremnim prihodom (`isIncomeReady` = `MODE_GET_RENT`); Contract Renewal kuće koje čekaju ugovor (`MODE_WAITING_FOR_CONTRACT`, ne napuštene), istim ugovorom po imenu za tip svake kuće, ako nivo dozvoljava | `ToolMoneyCollector`, `ToolContractSignator.areaDoClick` | kod + igra |
| Kartica zaključanog predmeta (`#63`) ima istu travu kao otključana (`#16`) pod 80 % plavo-sivim slojem (101,151,182, alfa 204) | `shop.swf` | SWF |
| Predmeti ograničenog trajanja posle `expireTime` ne idu u prodavnicu (`isAllowedToBeInShop`) | `ItemDefinition.isAllowedToBeInShop` | kod |

Nepotvrđeno:
- Tačan redosled crtanja preklopljenih objekata. Koristi se donja ivica osnove, pa x.
- Kadar kuće u ostalim režimima ugovora.
- `buy` događaj (misija „Pizzalicious“) se u originalu beleži u `NotificationSellingEnd.onAccept`; ovde se beleži pri završetku gradnje.
- Parametar `bonus` misija: koristi se sku kuće i porodica („houses_001“), po imenima iz definicija.
- `isFan`: vrednost dokumenta `fan` različita od „0“ tumači se kao fan.
- Predmet iz skladišta se postavlja već izgrađen. To je zaključeno iz toka `setItemDefinition`, nije potvrđeno.
- Čvrste pločice postoje i u početnim oblastima (npr. −10,−9). Zabrana je potvrđena samo kodom, nije poređena sa originalom u igri.
- Zastavica: svaka traka je ceo bitmap pomeren za širinu/8, pa prve trake ostaju prazne. Tako piše u kodu; nije poređeno sa originalom u igri.
- `maxUpgradesPerDay` (1500), 5 nadogradnji po poseti i 12 h: vrednosti iz `social.xml` koje je verovatno koristio server; klijent ih ne čita.
- Ključ opisa čuda po tipu i cilju (npr. `TID_WONDER_TYPE_INFLUENCE_HOUSES_INFO`) izabran je po imenu; brojač tid-ova tipova nije u pravilima.
- Položaj info-okvira prodavnice računa se od ivica okvira u DOM-u; original koristi `x + width` i `y + height/2` klipa, što može da se razlikuje za nekoliko piksela.
- `NPCS_ADVISOR_USER_ID` se uzima kao 0, a `bossGenre` iz snimka (podrazumevano 0, Ronald); snimak test grada nema to polje.
- Mapiranje `AssetManager_Note`..`Note3` na simbole `note`, `note_01`..`note_03` je iz SWF imena klasa; prikaz nije poređen sa originalom u igri.
- Info-okvir se vezuje za granice crteža zgrade sa senkom; original koristi širinu `ItemObject`-a, što može da se razlikuje.
- Zum 0,3 između 0,4 i 0,25 je izabran u fazi 8; original ima samo konstantu najmanjeg zuma.
- Broj nadogradnji po poseti NPC-u davao je server (`upgradesUniverseAvailable`); lokalno se koristi 5 iz `social.xml`.
- Faza 9: provera povezanosti sa HQ pri otkazivanju ugovora (`StateOnRent.doDoClick`) nije preneta jer motor nema povezanost puteva sa HQ.
- Faza 9: cena pomeranja se zaokružuje naniže (`Math.floor`); original sabira `Number` vrednosti bez vidljivog zaokruživanja.
- Faza 9: prevlačenje mape manje od prozora i produžetak ivica pozadine nisu originalni (original centrira mapu na beloj pozadini).
- Faza 9: uvećanje prozora Contractors (do 1,5×) nije originalno.

## Utvrđeno u fazi 9

- Otkazivanje ugovora: `StateOnRent.doDoClick` u `MODE_RENTING` (nije commerce, `isHQConnected`) otvara `PopupConfirmDestroy` sa `TID_CANCEL_CONTRACT`; `contractCancelOnAccept` → `MODE_CANCELING_CONTRACT` (3); `doDoLogicUpdate` posle `CONTRACT_CANCEL_TIME` = 3000 ms → `MODE_WAITING_FOR_CONTRACT`. Bez povraćaja.
- Move: `ToolMove` (stanja `STATE_WAITING_FOR_ITEM` / `STATE_MOVING_WITH_ITEM`), `isMouseOverEnabled` isključuje HQ; `doIsMoveable`: `StateOnRent` samo čekanje, najam, napuštena; izgradnja i izgrađeno da; notifikacija ne. Cena: `getPlaceItemCoins` = `movePriceCoins` + `getInstantBuildPrice(constructionTime, getMoveFactor)` = timePrice(XPTable nivoa) × minuti × min(`instantBuildFactor`, 1); `getPlaceItemCash` = `movePriceCash`. Usluga `move` (Profile.SERVICES_MOVE_SKU): 24 h, 10 zlata; `PopupConfirmMove` (`popup_confirm_buy_crane_operator`) i `PopupPayMove` (`popup_confirm_buy_rent_crane_operator`).
- `PopupServicePresentation` (`popup_wellcome_crane_operator`) se pravi u `DollarsGame`, ali se nigde ne prikazuje.
- Vrednost firme: `Profile.calculateCompanyValue` u `visitWorld` i `buyPlot`; `Profile.set DCCoins` / `set DCCash` menjaju je za istu razliku; `HudOwner.onUpdate` u poseti NPC-u prikazuje vrednost vlasnika.
- Prodavnica: `ItemContentUnlocked.getBox` → `shop_box_crew` (klubovi), `shop_box_wonder` (čuda), `shop_box`; svi zaključani → `shop_box_locked` (oblik #63: sloj (101,151,182) 80 % preko cele trave); `ItemContentLocked.setupIcon` → alpha 0,5.
- Skladište: `VaultBar` → `PopupStorage` (`Storage.swf` `popup_storage`, `storage_box`, `ITEMS_PER_PAGE` 4, razmak kao `setStorageItemPosition`).
- Proširenja: `PopupConfirmExpansion.showPopup` stavlja `box_invest_pending` u `box_2` i dugme „Invest“.
- Značka „Special Offer“: polje `best` rotirano oko −17° (`ItemService` zadržava rotaciju osim pri zameni fonta).
- Zum: `OptionsPanel.zoomsNormalScreen` i `zoomsFullScreen` su iste liste [1, 0,75, 0,5, 0,4]; `Map.onZoom` centrira mapu užu od stage-a.
- Ekran učitavanja: `pages/Background_loading.png` (760×600, bela okolina); stage `Dollars.swf` ima belu pozadinu.
