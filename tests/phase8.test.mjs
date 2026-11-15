import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions, definitionFiles } from "../public/js/game/definitions.js";
import { Mode } from "../public/js/game/economy.js";
import { importCity } from "../public/js/game/gameState.js";
import { ZOOM_LEVELS, ZOOM_MIN, ZoomController } from "../public/js/game/camera.js";
import { shopAvailability } from "../public/js/game/shop.js";
import { parseSocialRules, npcCityFile } from "../public/js/game/visits.js";
import { NPC_CITY_FILES, NpcVisit, composeVisitSave, isNpcCityFile, isUpgradable, mergeVisitorProgress, parseVisitLedger } from "../public/js/game/visitMode.js";
import { buyService, canBuy, emptyServices, inArea, offerAvailable, parseServices, parseServicesData, serviceActive, serviceArea } from "../public/js/game/services.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const data = (p) => JSON.parse(readFileSync(new URL("../public/data/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(definitionFiles().map((f) => [f, read("rules/" + f)])));
const manifest = read("manifest.json");
const social = parseSocialRules(read("rules/social.json"));
const HOUR = 3_600_000;

test("zoom: the original four levels plus 0.3 and ToolsBar.ZOOM_MIN 0.25; minus and plus walk all six", () => {
  assert.deepEqual([...ZOOM_LEVELS], [1, 0.75, 0.5, 0.4, 0.3, 0.25]);
  assert.equal(ZOOM_MIN, 0.25);
  const z = new ZoomController();
  const seen = [];
  for (let i = 0; i < 7; i++) { z.zoomOut(); seen.push(z.target); }
  assert.deepEqual(seen, [0.75, 0.5, 0.4, 0.3, 0.25, 0.25, 0.25]);
  z.zoomIn();
  assert.equal(z.target, 0.3);
  z.update(10_000);
  assert.equal(z.current, 0.3);
});

test("NPC cities: exactly the two original offline files, with their original object counts", () => {
  assert.deepEqual([...NPC_CITY_FILES], ["npc_advisor", "npc_boss"]);
  assert.equal(data("npc_advisor.json").items.length, 402);
  assert.equal(data("npc_boss.json").items.length, 496);
  for (const f of NPC_CITY_FILES) {
    const city = data(f + ".json");
    assert.ok(city.items.every((i) => defs.has(i.sku)), f + ": every item has a definition");
  }
  const npcs = read("rules/NPCDefinitions.json")._children.map((n) => ({ name: n.name }));
  assert.equal(npcCityFile(npcs, "Ronald"), "npc_advisor");
  assert.equal(npcCityFile(npcs, "Cindy"), "npc_advisor");
  assert.equal(npcCityFile(npcs, "Sheik"), "npc_boss");
  assert.equal(isNpcCityFile("npc_boss"), true);
  assert.equal(isNpcCityFile("test"), false);
  assert.equal(isNpcCityFile(null), false);
});

function playerSave() {
  const file = { format: "mcity-html5-city/1", profile: { DCCoins: "5000", DCCash: "3", exp: "100", cityname: "Home", companyValue: "1" },
    hqLevel: 0, items: [{ sid: 1, sku: "houses_001_001", x: 0, y: 0, state: { id: "1", mode: "4", time: "1000" } }], roads: [[1, 1]], terrain: [] };
  return importCity(file, 0);
}

test("visit: the composite state shows the NPC city with the visitor's profile; only visitor progress goes back", () => {
  const own = playerSave();
  const npc = importCity(data("npc_boss.json"), 0);
  const visit = composeVisitSave(own, npc);
  assert.equal(visit.items.length, 496);
  assert.equal(visit.profile.coins, 5000);
  assert.equal(visit.profile.cityName, "Home");
  visit.profile.coins += 100;
  visit.profile.exp += 10;
  visit.items.length = 0;
  visit.roads.push([9, 9]);
  const back = mergeVisitorProgress(own, visit);
  assert.equal(back.profile.coins, 5100);
  assert.equal(back.profile.exp, 110);
  assert.deepEqual(back.items, own.items);
  assert.deepEqual(back.roads, own.roads);
  assert.equal(own.profile.coins, 5000, "the player's save object is not changed in place");
});

test("visit upgrades: renting houses only, normal values for NPCs, once per house in 12 h, five per visit", () => {
  const house = defs.get("houses_001_001");
  const shop = [...defs.values()].find((d) => d.kind === "commerce");
  assert.equal(isUpgradable(house, Mode.Renting), true);
  assert.equal(isUpgradable(house, Mode.WaitingForContract), false);
  assert.equal(isUpgradable(shop, Mode.Renting), false);
  const target = { ownerId: "npc:Sheik", cityName: "Sheik`s City", isRonald: false, isPartner: false };
  const v = new NpcVisit("npc_boss", target, social, parseVisitLedger(null, 0));
  assert.deepEqual(v.upgrade(1, house, Mode.Renting, 0), { coins: 100, exp: 10 });
  assert.equal(v.upgrade(1, house, Mode.Renting, 1000), null, "a second click on the same house pays nothing");
  assert.equal(v.check(1, house, Mode.Renting, 1000), "too_soon");
  for (let sid = 2; sid <= 5; sid++) assert.ok(v.upgrade(sid, house, Mode.Renting, 0));
  assert.equal(v.remaining, 0);
  assert.equal(v.check(6, house, Mode.Renting, 0), "visit_limit");
  // The ledger survives a reload: a new visit still refuses house 1 for 12 hours.
  const again = new NpcVisit("npc_boss", target, social, parseVisitLedger(JSON.stringify(v.ledger), 2 * HOUR));
  assert.equal(again.check(1, house, Mode.Renting, 2 * HOUR), "too_soon");
  assert.equal(again.check(1, house, Mode.Renting, 13 * HOUR), null);
  assert.equal(parseVisitLedger("{broken", 0).today, 0);
});

test("services: original offers, gold paid once, time replaced not added, trial waits 48 h", () => {
  const offers = parseServices(read("rules/servicesDefinitions.json"));
  const mc = offers.get("moneyCollector");
  assert.deepEqual(mc.map((o) => [o.hours, o.priceCash, o.waitHours]), [[1440, 30, 0], [720, 25, 0], [360, 15, 0], [48, 2, 0], [0.1, 0, 48]]);
  assert.equal(offers.get("contractSignator").length, 5);
  const s = emptyServices();
  const wallet = { cash: 20, coins: 0 };
  assert.equal(canBuy(s, mc[0], 0, wallet.cash, wallet.coins), "no_gold");
  assert.equal(buyService(s, mc[0], 0, wallet), false);
  assert.equal(buyService(s, mc[3], 0, wallet), true);
  assert.equal(wallet.cash, 18);
  assert.equal(serviceActive(s, "moneyCollector", 47 * HOUR), true);
  assert.equal(serviceActive(s, "moneyCollector", 48 * HOUR), false);
  assert.equal(buyService(s, mc[4], HOUR, wallet), true, "free trial");
  assert.equal(wallet.cash, 18);
  assert.equal(s.moneyCollector.until, HOUR + 0.1 * HOUR, "buying replaces the remaining time (Profile.servicesContract)");
  assert.equal(offerAvailable(s, mc[4], 2 * HOUR), false);
  assert.equal(canBuy(s, mc[4], 2 * HOUR, 99, 0), "waiting");
  assert.equal(offerAvailable(s, mc[4], 49 * HOUR), true);
  const reloaded = parseServicesData(JSON.stringify(s));
  assert.deepEqual(reloaded, s);
  assert.deepEqual(parseServicesData("nonsense"), emptyServices());
});

test("service area: 11 x 11 setting covers tiles -6..5 around the cursor (Tool.areaSetSize)", () => {
  assert.deepEqual(serviceArea(20, 20, 11, 11), { x0: 14, y0: 14, x1: 25, y1: 25 });
  assert.deepEqual(serviceArea(20, 20, 10, 10), { x0: 15, y0: 15, x1: 24, y1: 24 });
  const a = serviceArea(20, 20, 11, 11);
  assert.equal(inArea(a, { x: 25, y: 25, w: 2, h: 2 }), true);
  assert.equal(inArea(a, { x: 26, y: 20, w: 2, h: 2 }), false);
  assert.equal(inArea(a, { x: 12, y: 12, w: 3, h: 3 }), true);
  const settings = read("rules/settings.json")._children[0];
  assert.deepEqual([settings.moneyCollectorAreaX, settings.contractSignatorAreaY], ["11", "11"]);
});

test("shop: expired limited-time items with art are listed as expired, not hidden; gifts and collections stay out", () => {
  const now = Date.UTC(2026, 10, 4);
  const counts = { available: 0, expired: 0, hidden: 0 };
  const byKind = {};
  for (const d of defs.values()) {
    if (manifest.items[d.sku]?.status !== "ok") continue;
    const a = shopAvailability(d, now);
    counts[a]++;
    (byKind[d.kind] ??= { available: 0, expired: 0, hidden: 0 })[a]++;
  }
  assert.ok(counts.expired > 100, "most former limited-time items are back in the catalogue");
  assert.equal(byKind.house.available + byKind.house.expired, 126, "every house with art (the collection reward house has no SWF)");
  assert.equal(byKind.commerce.available + byKind.commerce.expired, 80);
  for (const d of defs.values()) {
    if (d.attributes.freeGift === "1" || (d.attributes.where && !d.attributes.where.split(",").includes("shop"))) {
      assert.equal(shopAvailability(d, now), "hidden", d.sku);
    }
  }
  const week = [...defs.values()].filter((d) => d.attributes.shopTab === "new_items");
  assert.ok(week.every((d) => shopAvailability(d, now) === "expired"));
  assert.ok(week.every((d) => shopAvailability(d, Date.UTC(2012, 0, 10)) === "available"));
});

test("shop cards: unlocked and locked boxes both have the original grass layer; locked adds the original tint", () => {
  const L = read("ui_layout.json");
  assert.ok(L.shop_box.layers["#16"], "unlocked card background (grass + header)");
  assert.ok(L.shop_box_locked.layers["#63"], "locked card background (grass under the blue tint)");
  const order = L.shop_box.order;
  assert.ok(order.indexOf("#16") < order.indexOf("image") && order.indexOf("image") < order.indexOf("unlock_FC"),
    "the grass is behind the item picture, which is behind the price button");
});

test("local profiles: default keeps the original keys, others get their own suffix; bad data falls back", async () => {
  const { addProfile, parseProfileList, profileId, profileSuffix } = await import("../public/js/game/localProfile.js");
  assert.equal(profileSuffix(""), "");
  assert.equal(profileSuffix("anna"), ".p_anna");
  assert.equal(profileId("  Anna Marie! "), "anna_marie");
  let list = parseProfileList(null);
  assert.deepEqual(list, { active: "", ids: [] });
  list = addProfile(list, "Anna");
  assert.deepEqual(list, { active: "anna", ids: ["anna"] });
  list = addProfile(list, "Bob");
  assert.deepEqual(addProfile(list, "anna"), { active: "anna", ids: ["anna", "bob"] }, "an existing name is reused, not duplicated");
  assert.equal(addProfile(list, "!!!"), null);
  assert.deepEqual(parseProfileList(JSON.stringify({ active: "ghost", ids: ["anna", "Not Valid"] })), { active: "", ids: ["anna"] });
  assert.deepEqual(parseProfileList("{broken"), { active: "", ids: [] });
});
