import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { parseRules } from "../public/js/game/economy.js";
import { GameState, importCity, migrateSave } from "../public/js/game/gameState.js";
import { Missions, missionImageSku, missionReward, parseMissionRules } from "../public/js/game/missions.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const rules = parseMissionRules(read("rules/missionDefinitions.json"));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const economy = parseRules(read("rules/contracts.json"), read("rules/contractsTypes.json"), read("rules/settings.json"));
const empty = () => ({ up: [], reached: [], given: [], counts: {} });

function game(missions = empty()) {
  const file = { format: "mcity-html5-city/1", profile: { DCCoins: "1000", DCCash: "0", exp: "0", cityname: "T", companyValue: "0" },
    hqLevel: 0, items: [], roads: [], terrain: [], missions, pollCounts: missions.counts };
  const g = new GameState(importCity(file, 0), defs, economy);
  return { g, m: new Missions(rules, g.data.missions) };
}

test("only the base mission set is used and condition indexes follow definition order", () => {
  assert.equal(rules.length, 87);
  const clients = rules.filter((r) => r.eventSku === "checkInfluencecommerce_pizza").map((r) => [r.sku, r.conditionIndex, r.condition]);
  assert.deepEqual(clients, [[18, 0, 3], [19, 1, 10], [20, 2, 16]]);
  assert.deepEqual(missionReward(rules.find((r) => r.sku === 32)), { coins: 0, exp: 0, items: ["commerce_coffee"] });
});

test("the imported save's counts reproduce its mission states", () => {
  const city = JSON.parse(readFileSync(new URL("../public/data/city.json", import.meta.url)));
  const { m } = game({ ...city.missions, counts: city.pollCounts });
  m.evaluate(3);
  assert.ok(m.save.given.includes(18) && m.save.given.includes(19));
  assert.ok(m.save.up.includes(20), "Clients III is open: 2 of 3 thresholds met");
  assert.ok(m.save.up.includes(10), "Green Thumb I still needs two trees built");
  assert.ok(!m.save.reached.includes(10));
});

test("build events reach a mission which pays once when claimed", () => {
  const { g, m } = game();
  m.evaluate(1);
  assert.ok(m.save.up.includes(10));
  m.register("build", "Decorations_tree");
  m.evaluate(1);
  assert.ok(m.save.up.includes(10), "one of two trees");
  m.register("build", "Decorations_tree");
  m.evaluate(1);
  assert.ok(m.save.reached.includes(10));
  const coins = g.data.profile.coins;
  assert.deepEqual(g.claimMission(m, 10), { coins: 35000, exp: 0, items: [] });
  assert.equal(g.data.profile.coins, coins + 35000);
  assert.equal(g.claimMission(m, 10), null, "duplicate claim");
  assert.equal(g.data.profile.coins, coins + 35000);
  assert.ok(m.save.given.includes(10) && !m.save.reached.includes(10));
});

test("a claimed mission stays paid after a save/load round trip, and an unclaimed one stays claimable", () => {
  const { g, m } = game();
  m.evaluate(2);
  m.register("build", "houses_001_002");
  m.register("build", "Decorations_tree");
  m.register("build", "Decorations_tree");
  m.evaluate(2);
  assert.ok(m.save.reached.includes(6) && m.save.reached.includes(10));
  g.claimMission(m, 6);
  const reloaded = migrateSave(JSON.parse(JSON.stringify(g.data)));
  const g2 = new GameState(reloaded, defs, economy);
  const m2 = new Missions(rules, g2.data.missions);
  m2.evaluate(2);
  assert.equal(g2.claimMission(m2, 6), null, "restart cannot pay mission 6 again");
  assert.ok(m2.save.reached.includes(10), "evaluation on load must not drop a reached, unclaimed reward");
  assert.deepEqual(g2.claimMission(m2, 10), { coins: 35000, exp: 0, items: [] });
});

test("evaluation never moves missions backwards or gives rewards by itself", () => {
  const { g, m } = game({ up: [], reached: [10], given: [], counts: {} });
  const coins = g.data.profile.coins;
  for (let i = 0; i < 3; i++) m.evaluate(1);
  assert.deepEqual(m.save.reached, [10]);
  assert.ok(!m.save.given.includes(10));
  assert.equal(g.data.profile.coins, coins);
});

test("conditional events count each threshold once and unlock chains follow", () => {
  const { m } = game({ up: [], reached: [], given: [2], counts: {} });
  m.evaluate(1);
  assert.ok(m.save.up.includes(18), "unlocked by mission 2");
  assert.equal(m.check("checkInfluence", "commerce_pizza", 2), false);
  assert.equal(m.check("checkInfluence", "commerce_pizza", 12), true);
  assert.equal(m.save.counts.checkInfluencecommerce_pizza, 2, "3 and 10 passed, 16 not yet");
  m.evaluate(1);
  assert.ok(m.save.reached.includes(18) && m.save.reached.includes(19));
  assert.equal(m.check("checkInfluence", "commerce_pizza", 12), false, "same value counts nothing again");
  assert.equal(m.register("checkInfluence", "commerce_pizza"), false, "conditional events are not plain counts");
});

test("level-locked missions open with the level; incomplete objectives give nothing", () => {
  const { g, m } = game();
  m.evaluate(1);
  assert.ok(!m.save.up.includes(6), "Build I needs level 2");
  m.evaluate(2);
  assert.ok(m.save.up.includes(6));
  assert.equal(g.claimMission(m, 6), null, "not reached");
  assert.equal(m.register("build", "unknown_item"), false);
});

test("item rewards go to storage in the same claim", () => {
  const { g, m } = game({ up: [32], reached: [32], given: [31], counts: {} });
  assert.deepEqual(g.claimMission(m, 32), { coins: 0, exp: 0, items: ["commerce_coffee"] });
  assert.deepEqual(g.data.storage, ["commerce_coffee"]);
});

test("mission event keys follow ItemObject.registerEvent and StateOnRent.onIncome", async () => {
  const { itemEvents, collectEvents, bonusParameters } = await import("../public/js/game/missionEvents.js");
  assert.deepEqual(itemEvents("build", defs.get("decorations_tree_03")), [["build", "Decorations"], ["build", "Decorations_tree"], ["build", "decorations_tree_03"]]);
  assert.deepEqual(itemEvents("build", defs.get("commerce_pizza")), [["build", "Commerces"], ["build", "Commerces_food"], ["build", "commerce_pizza"]]);
  assert.deepEqual(collectEvents(defs.get("houses_001_002"), "72"), [["collect", "Houses%72"], ["collect", "Houses"], ["collect", "houses_001_002"]]);
  assert.deepEqual(collectEvents(defs.get("commerce_pizza"), null), [["collect", "Commerces"], ["collect", "commerce_pizza"]]);
  assert.deepEqual(bonusParameters("houses_001_002"), ["houses_001_002", "houses_001"]);
  const { m } = game();
  for (const [t, p] of itemEvents("build", defs.get("decorations_tree_03"))) m.register(t, p);
  assert.equal(m.save.counts.buildDecorations_tree, 1);
});

test("nameCity: PopupName moves an open mission straight to REACHED once, and the claim pays once", () => {
  const { g, m } = game({ up: [1], reached: [], given: [], counts: {} });
  assert.equal(m.markReached(1), true);
  assert.equal(m.markReached(1), false, "renaming again does not reach it twice");
  assert.deepEqual(g.claimMission(m, 1), { coins: 20000, exp: 0, items: [] });
  const reloaded = new Missions(rules, migrateSave(JSON.parse(JSON.stringify(g.data))).missions);
  assert.equal(reloaded.markReached(1), false, "given missions cannot be reached again after a reload");
  assert.equal(m.markReached(5), false, "a mission that is not open is not affected");
});

test("buyExpansion counts once per purchase and opens Size does Matter at level 20", () => {
  const { m } = game();
  assert.equal(m.register("buyExpansion", ""), true);
  assert.equal(m.save.counts.buyExpansion, 1);
  m.evaluate(19);
  assert.ok(!m.save.reached.includes(4), "locked below level 20");
  m.evaluate(20);
  assert.ok(m.save.reached.includes(4));
  const saved = JSON.parse(JSON.stringify(m.save));
  const again = new Missions(rules, saved);
  again.evaluate(20);
  assert.equal(again.save.counts.buyExpansion, 1, "loading does not add counts");
});

test("visit events use their own keys: visitCity, visitFriend and visitPartner are separate counts", () => {
  const { m } = game();
  assert.equal(m.register("visitCity", ""), true);
  assert.equal(m.register("visitPartner", ""), true);
  assert.equal(m.register("visitRonald", ""), false, "no mission listens to visitRonald");
  assert.deepEqual([m.save.counts.visitCity, m.save.counts.visitPartner], [1, 1]);
});

test("missions with imageIsRequired load <type>_<parameter> (beat: <type>_<condition>) and every image was exported", () => {
  const withImage = rules.filter((r) => r.imageIsRequired);
  // 93, 99, 183 and 266 also require images but belong to the showInABtest group, which is not loaded.
  assert.deepEqual(withImage.map((r) => r.sku), [10, 18, 19, 25, 56]);
  assert.equal(missionImageSku(rules.find((r) => r.sku === 10)), "build_Decorations_tree");
  assert.equal(missionImageSku(rules.find((r) => r.sku === 56)), "beat_2");
  assert.equal(missionImageSku(rules.find((r) => r.sku === 25)), "bonus_houses_001");
  assert.equal(missionImageSku({ imageIsRequired: true, type: "bonus", parameter: "houses_001_001", condition: 12 }), "bonus_houses_001_001");
  assert.equal(missionImageSku(rules.find((r) => r.sku === 1)), null);
  const layouts = read("ui_layout.json");
  for (const r of withImage) assert.ok(layouts["mission_" + missionImageSku(r)], `image for mission ${r.sku}`);
  assert.ok(layouts.popup_mission_background_01_image_01.origins.image_01, "image_01 registration point");
});
