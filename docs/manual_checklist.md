# Ručna provera u običnom Edge/Chrome

Automatski testovi proveravaju događaje i stanje, ne i ono što se čuje i vidi tokom dužeg rada. Ova lista se radi u
običnom (ne headless) pregledaču, na izolovanoj kopiji snimka.

## Priprema

1. Pokreni build i server iz korena projekta:
   `npm run build` i `npm run serve` (ili `node vendor/typescript/bin/tsc -p tsconfig.json` i `node tools/serve.mjs`).
2. Otvori `http://127.0.0.1:8417/?city=test&fresh=1&view=1090,690`.
   - `city=test` koristi `public/data/city_test.json`, a snimak ide pod ključ `mcity.save.v1.test`.
   - Pravi snimak (`mcity.save.v1`) se ne dira; `fresh=1` koristi samo sa `city=test`.
3. Otvori DevTools (F12): kartice Console i Performance monitor (CPU, JS heap). Zabeleži početni JS heap.
4. Klikni jednom na igru. Pregledač pušta zvuk tek posle korisničkog gesta.

## Koraci

| # | Radnja | Očekivano (izvor) | Rezultat |
|---|---|---|---|
| 1 | Sačekaj posle prvog klika | čuje se `main.mp3` u petlji (`DollarsGame.getCurrentMusic`) | |
| 2 | Teren → kupi 4 polja, Build → kuća na parceli | zvuk gradnje `build.mp3` pri postavljanju; teren bez zvuka | |
| 3 | Buldožer → sruši kuću i potvrdi „Yes“ u prozoru | zvuk `bulldoze.mp3`; dekoracija se ruši bez zvuka | |
| 4 | Na kući koja čeka ugovor izaberi ugovor | zvuk `contract.mp3` | |
| 5 | Naplati kiriju (u konzoli `mcity.fastForward(3*60*60*1000)`, sačekaj 2 s, klikni kuću sa ikonicom novca) | zvuk `money.mp3`, iznos iznad kuće | |
| 6 | Preuzmi dostignutu misiju (ikonica levo) | zvuk `money.mp3`, nagrada u HUD-u | |
| 7 | Novi nivo: u konzoli `mcity.scene.state.data.profile.exp = 1570`, pa naplati kiriju ili preuzmi misiju | prozor „Congratulations! Level 4“, zvuk `levelup.mp3` | |
| 8 | Klik na ime grada u HUD-u, upiši novo ime, Done | ime se menja; avion sa transparentom preleće mapu zdesna nalevo | |
| 9 | Ostavi igru otvorenu 10 minuta bez interakcije | vozila se pojavljuju i nestaju; nema grešaka u konzoli; JS heap bez stalnog rasta | |
| 10 | Osveži stranicu **bez** `fresh=1` | novac, objekti, misije i skladište su isti kao pre osvežavanja; nijedna nagrada se ne pojavljuje ponovo | |
| 11 | Promeni veličinu prozora i zumiraj točkićem | HUD i traka alata ostaju uz ivice; zum kroz 1 / 0,75 / 0,5 / 0,4 | |

## Faza 7: originalni UI

Skripte `tools/phase7_browser.py` (jedan server i jedan Chrome sa privremenim profilom) i `tools/phase7_cdp.py`, a
regresija `tools/phase7_regression.py`. Rezultati iz 2026-11-04 su u `docs/evidence/phase7_2026-10-30/chrome/`.

| # | Radnja | Očekivano (izvor) | Rezultat |
|---|---|---|---|
| 12 | Pogledaj traku komšija | 5 × „Add Neighbors“, igrač, Ronald (2), Sheik (1); klik na prazno mesto ili „Add Neighbors“ daje poruku o serveru (`FriendsBar`) | PASS |
| 13 | Kofer, poklon, grafikon | kofer i grafikon: poruka o ograničenju; poklon otvara skladište (`ToolsBar`) | PASS |
| 14 | Klik na HQ | prozor „Company Value“ sa pet redova, OK zatvara (`PopupValue`) | PASS |
| 15 | Zum +/−, muzika, efekti, zupčanik, pa osveži stranicu | zum se menja; muzika i efekti se gase i pale, stanje ostaje posle osvežavanja; zupčanik skriva red (`OptionsPanel`) | PASS (čujnost NOT VERIFIED) |
| 16 | Okrugla ikonica levo | otvara i zatvara Local Profile Settings; dodaj/oduzmi novac, zlato, XP; promeni ime i sliku | PASS |
| 17 | Prodavnica: sve četiri kategorije, Specials, Skyscraper Week | kartice sa travom, ikonica novca, istekle ponude zaključane | PASS |
| 18 | Mišem preko kuće sa ugovorom i preko prodavnice | posle ~0,4 s narandžasti okvir uz zgradu, vreme teče | PASS |
| 19 | Dostignuta misija | „Mission Completed“, slika misije, kiša novca; „Share success“ zatvara i isplaćuje jednom | PASS |
| 20 | Prozor 1280×720, 1920×1080, ceo ekran 2560×1440 | sve trake i prozori vidljivi, buldožer ceo | PASS |

## Faza 8

Alati: `tools/phase7_browser.py`, `tools/phase7_cdp.py` (vraća minimizovan prozor pre svake komande), `tools/phase7_regression.py`,
`tools/phase8_perf.py`. Rezultati iz 2026-11-04 su u `docs/evidence/phase8_2026-11-04/`.

| # | Radnja | Očekivano | Rezultat |
|---|---|---|---|
| 21 | Dugme zum − šest puta, pa + | 0,75 → 0,5 → 0,4 → 0,3 → 0,25; mapa centrirana; prelaz i klik i dalje rade | PASS |
| 22 | Prodavnica, poslednje strane kategorija | istekle ponude kao „Limited time!“; sa opcijom u Local Profile Settings mogu da se kupe | PASS |
| 23 | Kofer → Collect / Contracts → klik na mapu | prozor sa ponudama; posle kupovine zlatom usluga radi u oblasti 11 × 11 | PASS |
| 24 | Klik na Ronalda / Sheika u traci komšija | njihov grad, natpis „offline NPC city“, nadogradnja kuće u najmu +100 $ +10 XP jednom; Go Home | PASS |
| 25 | Local Profile Settings → New Profile, pa izbor „Default“ | novi profil sa svojim gradom; povratak na stari bez izmena | PASS |

## Faza 9

Alati: `tools/phase9_checks.py`, `tools/phase9_shop_audit.py` (pored alata faze 8). Rezultati: `docs/evidence/phase9_2026-11-04/`.

| # | Radnja | Očekivano | Rezultat |
|---|---|---|---|
| 26 | Zum − šest puta, pa prevući mapu | mapa centrirana, pa se pomera; oko nje nastavak pozadine, ne belo | PASS |
| 27 | Klik na kuću u najmu → Yes | `TID_CANCEL_CONTRACT`; posle 3 s kuća čeka ugovor; isto posle ponovnog učitavanja | PASS |
| 28 | Kofer → Move → kuća → slobodno mesto | `PopupPayMove` sa cenom; ✓ plaća i pomera, X ostavlja kuću na mestu, Rent −10 zlata pa besplatno | PASS |
| 29 | Kofer → Contracts → klik na mapu | veći prozor, „Special Offer“ rotiran na zelenoj znački | PASS |
| 30 | Poklon (skladište) | prozor „Storage“, prazan tekst ili kartice sa „Use“ | PASS |
| 31 | Ronald → kući → Sheik → kući, više puta | originalni ekran učitavanja umesto bele strane; HUD prikazuje vrednost vlasnika; sopstveni grad isti | PASS |
| 32 | Prodavnica, sve kategorije i strane | otključane kartice na travi; zaključane pod plavo-sivim slojem, slika providna 50 %; čuda u žutom okviru | PASS (379 kartica, automatski) |

## Šta zabeležiti

- trajanje provere i FPS (u konzoli `mcity.state().fps`);
- greške i upozorenja iz konzole (osim upozorenja o AudioContext-u pre prvog klika);
- JS heap na početku i na kraju;
- za svaki zvuk: da li se čuje i da li se čuje samo jednom.

Napomena: Edge 156 se u ovom okruženju ruši posle oko 60 s (izlaz 0xC0000005), i headless i sa prozorom, i to i na praznoj
stranici. Chrome 156 radi stabilno, pa se za proveru koristi Chrome.

## Faza 6 — rezultati i desktop verzija

Koraci 12–16 su provereni u fazi 6 (`docs/evidence/phase6_2026-10-30/chrome/`): 12, 13, 14 i 16 PASS; 15 PASS na 60 Hz.
Desktop verzija: pokrenuti `Millionaire City HTML5.exe`, izgraditi nešto, zatvoriti, ponovo pokrenuti i proveriti stanje;
F11 = ceo ekran. Ostaje za čoveka: da li se zvuci čuju, 2560×1440 / 144+ Hz, restart Windows-a.

## Faza 4 — dodatni koraci

| # | Radnja | Očekivano (izvor) | Rezultat |
|---|---|---|---|
| 12 | Prodavnica → Wonders, miš preko prvog čuda | okvir `popup_info_box_wonder_right` sa nazivom, veličinom, vremenom i opisom (`ShopMenuInfoWonder`) | čeka |
| 13 | U konzoli `mcity.scene.state.data.profile.coins = 50`, pa izbor ugovora na kući | prozor „Not Enough Cash“ bez dugmeta za plaćanje; ugovor nije potpisan, novac isti | čeka |
| 14 | Dva preleta aviona (dve promene imena) | drugi let ima zastavicu sa novim imenom; nema greške u konzoli | čeka |

| 15 | Test grad 3 minuta posle faze 5: FPS i JS heap | bez rasta heap-a; ekonomski korak bez zastoja | čeka |
| 16 | Prozori ugovora, rušenja, misije sa slikom i prodavnica posle `SwfPanel.placeChild` | isti položaji kao na snimcima faze 3 | čeka |

`tools/manual_session.py` već sadrži korake 12 i 13 (snimci `04d_wonder_info.png`, `04e_no_cash.png`).

## Automatizovana sesija (faza 3)

`python -I tools\manual_session.py <izlaz> [sekunde_saobraćaja] [--headless]` pokreće jedan server i jedan Chrome sa
privremenim profilom i prolazi korake 1–10. Zvuk meri `tools\audio_meter.ps1` (izlazni nivo audio sesija tog Chrome-a);
to je dokaz da zvuk izlazi, ne da ga je čovek čuo. Prozor Chrome-a ne sme biti minimizovan: tada pregledač ne crta i
logika staje. Rezultati faze 3 su u `docs/evidence/phase3_2026-10-30/`.

| # | Rezultat faze 3 |
|---|---|
| 1 | izlaz izmeren (vrh 0,18) |
| 2 | izlaz izmeren (0,28) |
| 3 | izlaz izmeren (0,43); prozor je sada originalni `PopupDestroy` |
| 4 | izlaz izmeren (0,74); prozor je sada originalni `ContractBox` |
| 5 | izlaz izmeren (0,44) |
| 6 | nije posebno mereno |
| 7 | nivo 4 i prozor potvrđeni; zvuk izmeren zajedno sa naplatom |
| 8 | potvrđeno, sa talasanjem zastavice |
| 9 | 191 s u headless Chrome-u; 10 minuta nije rađeno |
| 10 | potvrđeno |
| 11 | nije rađeno u fazi 3 |
| slušanje | NOT VERIFIED |
