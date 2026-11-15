# Roadmap

Statusi su u `RECONSTRUCTION_COMPLETION_CRITERIA.md` i `report.md`, pravila originala u `engine_facts.md`.

0. **Ljudska provera:** slušanje zvuka i dugmadi muzike i efekata, restart Windows-a sa desktop verzijom, instalacija 0.7.0 (instaler je napravljen, ali nije pokretan). Buldožer na 1280 px i 2560×1440 provereni su u fazi 7.
1. **Ručna validacija faze 4** po `docs/manual_checklist.md` (čeka potvrdu korisnika za pokretanje servera): okvir čuda,
   prozor „Not Enough Cash“, avion posle izmene memorije, rezervna kopija snimka.
2. ~~**Poseta NPC gradu**~~ urađeno u fazi 8 (ostaje: HUD vlasnika grada u ulozi posetioca). Raniji opis: učitavanje `npc_boss.json` / `npc_advisor.json` preko `OfflineNpcCitySource` u ulozi
   posetioca (bez gradnje, klik na kuću = nadogradnja preko `VisitSession`), avion sa imenom posećenog grada,
   događaji `visitRonald`/`visitFriend` + `visitCity`, povratak u svoj grad. Broj nadogradnji po poseti nije poznat iz
   klijenta; koristiti 5 iz `social.xml` uz oznaku da je to pretpostavka.
3. **Zamena zlata za novac** kada nema dovoljno novca (`PopupConfirm.startExchangeGold`, `RulesFacade.getDCCashToDCCoins`).
4. **Kolekcije** i avioni `plane_02/03/04` (`plane_show.swf` za `plane_04`).
5. **Održavanje:** podela `CityScene.ts` (avion, proširenja, saobraćaj u zasebne klase) uz proveru u igri posle svakog koraka.
6. Blokirano serverom (ne izmišlja se): prijatelji, partneri, investicije, `collectUpgraded`, Facebook krediti.
7. **Posle faze 7:** info-okviri `InfoBoxWonder` (kuća koja čeka ugovor) i `InfoBoxAbandoned` (nepovezana kuća); kursor HQ-a
   (`CURSOR_HQ_01`); isticanje aktivne kategorije prodavnice; sloj sjaja iznad trake vremena u info-okviru; vrednost firme
   u HUD-u da prati promene novca i zlata kao `Profile.set DCCoins` (dira ekonomiju, zato posebno i uz testove).
8. **Posle faze 8:** ~~alat Move~~, ~~oznaka „Special Offer“~~, ~~vrednost firme u HUD-u~~ i ~~HUD vlasnika u poseti~~ urađeni u fazi 9; prozor dobrodošlice za usluge original ne prikazuje (ne dodaje se). Ostaje HUD-prikaz preostalog vremena usluga (`HudOwner.setTipService`).
9. **Posle faze 9:** provera povezanosti kuće sa HQ (`isHQConnected`) pri otkazivanju i drugim radnjama; `VaultBar` sa dugmetom Collectibles (kolekcije ne postoje lokalno); traka otkazivanja na kući (`CONTRACT_CANCEL_BAR_ID` 6); prelaz između gradova bez ponovnog učitavanja stranice.
