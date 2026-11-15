import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions, definitionFiles } from "../public/js/game/definitions.js";
import { NO_CITY_SOURCE, VisitSession, parseSocialRules, visitMissionEvents } from "../public/js/game/visits.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const readData = (n) => JSON.parse(readFileSync(new URL(`../public/data/${n}.json`, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(definitionFiles().map((f) => [f, read("rules/" + f)])));
const rules = parseSocialRules(read("rules/social.json"));
const H = 3_600_000;

test("social.xml upgrade rules", () => {
  assert.deepEqual(rules, {
    normal: { visitorCoins: 100, visitorExp: 10, ownerExtraPercentage: 10 },
    super: { visitorCoins: 150, visitorExp: 15, ownerExtraPercentage: 12 },
    maxItemsPerVisit: 5, repeatUpgradeMs: 12 * H, maxUpgradesPerDay: 1500,
  });
});

test("visit events follow DollarsGame.changeState: visitFriend or visitRonald, visitPartner, visitCity", () => {
  assert.deepEqual(visitMissionEvents({ ownerId: "f", cityName: "A", isRonald: false, isPartner: false }), [["visitFriend", ""], ["visitCity", ""]]);
  assert.deepEqual(visitMissionEvents({ ownerId: "r", cityName: "B", isRonald: true, isPartner: true }),
    [["visitRonald", ""], ["visitPartner", ""], ["visitCity", ""]]);
});

test("there is no local city source, so no visit can start", async () => {
  assert.equal(NO_CITY_SOURCE.available, false);
  assert.equal(await NO_CITY_SOURCE.load("anyone"), null);
});

test("upgrades: renting houses only, five per visit, the same house again after 12 hours", () => {
  const house = (key, extra = {}) => ({ key, def: defs.get("houses_001_001"), renting: true, lastUpgradeAt: null, ...extra });
  const items = [1, 2, 3, 4, 5, 6].map((k) => house(String(k)));
  const city = { target: { ownerId: "x", cityName: "X", isRonald: false, isPartner: false }, items };
  const s = new VisitSession(rules, city);
  const r = s.upgrade(items[0], 0);
  assert.deepEqual([r.coins, r.exp], [100, 10]);
  assert.deepEqual(r.events, [["upgrade", "Houses"], ["upgrade", "houses_001_001"]]);
  assert.equal(s.upgrade(items[0], 1000), null, "the same house twice");
  assert.equal(s.canUpgrade(items[0], 11 * H), "too_soon");
  for (const it of items.slice(1, 5)) assert.ok(s.upgrade(it, 0));
  assert.equal(s.canUpgrade(items[5], 0), "visit_limit");
  assert.equal(s.remaining, 0);
  const fresh = new VisitSession(rules, city);
  assert.equal(fresh.canUpgrade(items[0], 12 * H), null, "allowed again after 12 hours");
  assert.equal(fresh.canUpgrade(house("7", { renting: false }), 0), "not_renting");
  assert.equal(fresh.canUpgrade({ ...house("8"), def: defs.get("commerce_pizza") }, 0), "not_house");
  assert.equal(new VisitSession(rules, city, 1500).canUpgrade(house("9"), 0), "day_limit");
});

test("NPC cities come from the original offline universe files: Sheik (last NPC) the boss file, the others the advisor file", async () => {
  const { OfflineNpcCitySource, npcCityFile } = await import("../public/js/game/visits.js");
  const npcs = read("rules/NPCDefinitions.json")._children;
  assert.deepEqual(npcs.map((n) => n.name), ["Ronald", "Cindy", "Sheik"]);
  assert.equal(npcCityFile(npcs, "Sheik"), "npc_boss");
  assert.equal(npcCityFile(npcs, "Ronald"), "npc_advisor");
  assert.equal(npcCityFile(npcs, "Cindy"), "npc_advisor");
  assert.equal(npcCityFile(npcs, "Nobody"), null);
  const files = { npc_boss: readData("npc_boss"), npc_advisor: readData("npc_advisor") };
  const src = new OfflineNpcCitySource(npcs, defs, async (f) => files[f] ?? null);
  const sheik = await src.load("npc:Sheik");
  assert.equal(sheik.target.cityName, "Sheik`s City");
  assert.equal(sheik.target.isRonald, false);
  assert.equal(sheik.items.length, 496, "every item of the original file has a definition");
  const ronald = await src.load("npc:Ronald");
  assert.deepEqual(visitMissionEvents(ronald.target), [["visitRonald", ""], ["visitCity", ""]]);
  assert.ok(ronald.items.some((i) => i.renting && i.def.kind === "house"), "houses on rent can be upgraded");
  assert.equal(await src.load("friend:42"), null, "friends need universeFriend.xml, which does not exist");
});

test("partners get super upgrades (UpgradesManager.setNeighborId): 150 $ and 15 XP", () => {
  const item = { key: "1", def: defs.get("houses_001_001"), renting: true, lastUpgradeAt: null };
  const city = { target: { ownerId: "p", cityName: "P", isRonald: false, isPartner: true }, items: [item] };
  const r = new VisitSession(rules, city).upgrade(item, 0);
  assert.deepEqual([r.coins, r.exp], [150, 15]);
});
