import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { parseRules, Mode } from "../public/js/game/economy.js";
import { GameState, importCity, migrateSave, validateSave } from "../public/js/game/gameState.js";
import { Builder, parseLevels } from "../public/js/game/construction.js";
import { relativeToTile } from "../public/js/game/geometry.js";
import { CityModel } from "../public/js/game/city.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const rules = parseRules(read("rules/contracts.json"), read("rules/contractsTypes.json"), read("rules/settings.json"));
const levels = parseLevels(read("rules/XPTable.json"));
const settings = { itemProfitPercentage: 35, terrainProfitPercentage: 100 };
const MIN = 60_000;

function setup({ coins = 1_000_000, exp = 0, terrain = [], roads = [], items = [] } = {}) {
  const file = { format: "mcity-html5-city/1", profile: { DCCoins: String(coins), DCCash: "0", exp: String(exp), cityname: "T", companyValue: "0" },
    hqLevel: 0, items, roads, terrain };
  const game = new GameState(importCity(file, 0), defs, rules);
  return { game, b: new Builder(game, levels, settings) };
}
const T = (rx, ry) => relativeToTile(rx, ry);
const plot = (rx, ry, w, h) => {
  const out = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) out.push([rx + x, ry + y]);
  return out;
};
const roadMap = (roads) => new CityModel({ format: "mcity-html5-city/1", profile: {}, hqLevel: 0, items: [], roads, terrain: [] }, defs).tileIndices();

test("levels and terrain prices come from XPTable.xml", () => {
  const { b } = setup({ exp: 1476 });
  assert.equal(b.level(), 3);
  assert.equal(b.terrainPrice(), levels[2].terrainPrice);
});

test("terrain plots cost the level price, need owned free land and are refunded in full", () => {
  const { game, b } = setup();
  const t = T(0, 0);
  const coins = game.data.profile.coins;
  assert.equal(b.canBuyTerrain(t.x, t.y), null);
  assert.ok(b.buyTerrain(t.x, t.y));
  assert.equal(game.data.profile.coins, coins - b.terrainPrice());
  assert.equal(b.canBuyTerrain(t.x, t.y), "occupied");
  const far = T(-40, -25);
  assert.equal(b.canBuyTerrain(far.x, far.y), "not_owned");
  assert.equal(b.removeTerrain(t.x, t.y), b.terrainPrice());
  assert.equal(game.data.profile.coins, coins);
});

test("houses and shops need plots on every base tile; decorations do not", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 2, 2) });
  const t = T(0, 0);
  assert.equal(b.canPlace("houses_001_001", t.x, t.y), null);
  assert.equal(b.canPlace("commerce_pizza", t.x, t.y), "needs_terrain", "3x3 base on a 2x2 plot");
  const d = T(5, 5);
  assert.equal(Number(defs.get("decorations_font_02").attributes.level), 12);
  assert.equal(b.canPlace("decorations_font_02", d.x, d.y), "locked");
  game.data.profile.exp = 1_000_000;
  assert.equal(b.canPlace("decorations_font_02", d.x, d.y), null, "no plot needed for a decoration");
});

test("placement rejects occupied, road, locked, unaffordable and out-of-area positions", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 4, 4), roads: [[0, 5]], items: [{ sid: 1, sku: "houses_001_001", x: 2, y: 2 }] });
  assert.equal(b.canPlace("houses_001_001", T(1, 1).x, T(1, 1).y), "occupied");
  game.data.profile.exp = 1_000_000;
  assert.equal(b.canPlace("decorations_tree_01", T(0, 5).x, T(0, 5).y), "occupied");
  game.data.profile.exp = 0;
  assert.equal(b.canPlace("commerce_flower_shop", T(0, 0).x, T(0, 0).y), "locked");
  game.data.profile.coins = 10;
  assert.equal(b.canPlace("houses_001_001", T(0, 0).x, T(0, 0).y), "coins");
  assert.equal(b.place("houses_001_001", T(0, 0).x, T(0, 0).y, 0), null);
  assert.equal(game.data.profile.coins, 10, "a rejected placement costs nothing");
});

test("building charges construction coins, counts down and finishes on click", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 3, 3) });
  const def = defs.get("commerce_pizza");
  const coins = game.data.profile.coins;
  const sid = b.place("commerce_pizza", T(0, 0).x, T(0, 0).y, 1000);
  assert.ok(sid);
  assert.equal(game.data.profile.coins, coins - Number(def.attributes.constructionCoins));
  assert.equal(b.constructionLeftMs(sid), Number(def.attributes.constructionTime) * MIN);
  assert.equal(b.finishConstruction(sid, 1000 + MIN), false);
  b.advance(1000 + 20 * MIN);
  assert.equal(b.constructionLeftMs(sid), 0);
  const exp = game.data.profile.exp;
  assert.ok(b.finishConstruction(sid, 1000 + 20 * MIN));
  assert.equal(b.finishConstruction(sid, 1000 + 20 * MIN), false, "finishing twice gives nothing");
  assert.equal(game.data.profile.exp, exp + Number(def.attributes.exp));
  assert.equal(game.item(sid).state.mode, Mode.Renting);
});

test("a finished house waits for a contract; construction timing is frame-rate independent", () => {
  const mk = () => {
    const s = setup({ terrain: plot(0, 0, 2, 2) });
    return { ...s, sid: s.b.place("houses_001_001", T(0, 0).x, T(0, 0).y, 0) };
  };
  const a = mk(), c = mk();
  for (let t = 0; t < 4 * MIN; t += 33) a.b.advance(t);
  a.b.advance(4 * MIN);
  c.b.advance(4 * MIN);
  assert.deepEqual(a.game.item(a.sid).construction, c.game.item(c.sid).construction);
  c.b.advance(60 * MIN);
  assert.ok(c.b.finishConstruction(c.sid, 60 * MIN));
  assert.equal(c.game.item(c.sid).state.mode, Mode.WaitingForContract);
});

test("roads are free, replace plots with a refund, join automatically and can be removed", () => {
  const { game, b } = setup({ terrain: [[1, 0]] });
  const coins = game.data.profile.coins;
  for (const [x, y] of [[-1, 0], [0, 0], [1, 0], [2, 0], [1, 1], [1, -1]]) assert.ok(b.buildRoad(T(x, y).x, T(x, y).y));
  assert.equal(game.data.profile.coins, coins + b.terrainPrice(), "the plot under the road was refunded");
  assert.equal(game.data.terrain.length, 0);
  assert.equal(b.buildRoad(T(0, 0).x, T(0, 0).y), false, "already a road");
  const at = (idx, rx, ry) => idx[T(rx, ry).y * 90 + T(rx, ry).x];
  const idx = roadMap(game.data.roads);
  assert.equal(at(idx, 1, 0), 62 + 16 - 1, "4-way junction form");
  assert.equal(at(idx, 0, 0), 1, "crosswalk on the straight west of the junction");
  assert.equal(at(idx, 2, 0), 62 + 11 - 1, "dead end east of the junction keeps its own form (no crosswalk)");
  assert.ok(b.removeRoad(T(1, 1).x, T(1, 1).y));
  assert.equal(b.removeRoad(T(1, 1).x, T(1, 1).y), false);
  assert.equal(at(roadMap(game.data.roads), 1, 0), 62 + 19 - 1, "T junction after demolition");
});

test("demolition refunds 35% of the value, keeps the plot and protects the headquarters", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 2, 2), items: [{ sid: 5, sku: "houses_001_001", x: 0, y: 0 }, { sid: 6, sku: "HeadQuarter", x: 5, y: 5 }] });
  const value = Number(defs.get("houses_001_001").attributes.companyValue);
  const coins = game.data.profile.coins;
  assert.equal(b.demolish(5), Math.trunc(value * 35 / 100));
  assert.equal(game.data.profile.coins, coins + Math.trunc(value * 35 / 100));
  assert.equal(game.item(5), undefined);
  assert.equal(game.data.terrain.length, 4);
  assert.equal(b.demolish(6), null);
  assert.equal(b.demolish(5), null);
});

test("the destroy popup shows the same refund the demolition pays, without changing anything", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 2, 2), items: [{ sid: 5, sku: "houses_001_001", x: 0, y: 0 }, { sid: 6, sku: "HeadQuarter", x: 5, y: 5 }] });
  const before = JSON.stringify(game.data);
  const refund = b.demolishRefund(5);
  assert.equal(refund, Math.trunc(Number(defs.get("houses_001_001").attributes.companyValue) * 35 / 100));
  assert.equal(JSON.stringify(game.data), before);
  assert.equal(b.demolishRefund(6), null, "headquarters");
  assert.equal(b.demolishRefund(99), null);
  assert.equal(b.demolish(5), refund);
});

test("version 1 saves migrate to the current version without losing data", () => {
  const v2 = importCity({ format: "mcity-html5-city/1", profile: { DCCoins: "5", DCCash: "0", exp: "7", cityname: "X", companyValue: "0" },
    hqLevel: 0, items: [{ sid: 9, sku: "houses_001_001", x: 0, y: 0 }], roads: [], terrain: [] }, 0);
  const { areas, nextSid, missions, storage, ...rest } = v2;
  assert.ok(missions && storage);
  assert.ok(areas && nextSid);
  const v1 = { ...rest, version: 1, profile: { ...v2.profile } };
  delete v1.profile.isFan;
  const m = migrateSave(v1);
  assert.equal(m.version, 3);
  assert.deepEqual(m.missions, { up: [], reached: [], given: [], counts: {} });
  assert.deepEqual(m.storage, []);
  assert.deepEqual(m.areas, [14, 15, 20, 21]);
  assert.equal(m.nextSid, 10);
  assert.equal(m.profile.coins, 5);
  assert.equal(validateSave(m), true);
  assert.equal(migrateSave({ version: 7 }), null);
});

test("storage: a rewarded item is placed once, free, and leaves the stack", () => {
  const { game, b } = setup({ coins: 0, terrain: plot(0, 0, 3, 3) });
  game.data.storage.push("commerce_coffee");
  const t = T(0, 0);
  assert.equal(b.canPlace("commerce_coffee", t.x, t.y), "coins", "buying it would cost coins");
  assert.equal(b.canPlaceFromStorage("commerce_coffee", t.x, t.y), null, "no price or level check for stored items");
  const sid = b.placeFromStorage("commerce_coffee", t.x, t.y, 0);
  assert.ok(sid);
  assert.equal(game.data.profile.coins, 0);
  assert.deepEqual(game.data.storage, []);
  assert.equal(b.placeFromStorage("commerce_coffee", T(5, 5).x, T(5, 5).y, 0), null, "the single unit cannot be placed twice");
  assert.equal(game.item(sid).state.mode, 4, "a stored shop is placed working");
  const reloaded = migrateSave(JSON.parse(JSON.stringify(game.data)));
  assert.deepEqual(reloaded.storage, []);
});

test("storage placement still needs free land and a plot", () => {
  const { game, b } = setup({ terrain: [] });
  game.data.storage.push("houses_001_001");
  assert.equal(b.canPlaceFromStorage("houses_001_001", T(0, 0).x, T(0, 0).y), "needs_terrain");
  assert.deepEqual(game.data.storage, ["houses_001_001"]);
});

test("a full save/load round trip mid-game keeps construction time, money, storage and areas, and pays nothing twice", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 5, 3), coins: 500_000 });
  const pizza = b.place("commerce_pizza", T(0, 0).x, T(0, 0).y, 0);
  const house = b.place("houses_001_001", T(3, 0).x, T(3, 0).y, 0);
  game.data.storage.push("decorations_tree_01");
  b.advance(5 * MIN);
  const left = b.constructionLeftMs(pizza);
  assert.ok(left > 0);
  const json = JSON.stringify(game.snapshot());
  const restored = new GameState(migrateSave(JSON.parse(json)), defs, rules);
  const b2 = new Builder(restored, levels, settings);
  assert.equal(restored.data.profile.coins, game.data.profile.coins);
  assert.deepEqual(restored.data.storage, ["decorations_tree_01"]);
  assert.deepEqual(restored.data.areas, game.data.areas);
  assert.equal(b2.constructionLeftMs(pizza), left, "the remaining time is stored, not reset");
  b2.advance(5 * MIN + left);
  const exp = restored.data.profile.exp;
  assert.ok(b2.finishConstruction(pizza, 5 * MIN + left));
  assert.equal(b2.finishConstruction(pizza, 5 * MIN + left), false);
  // A second copy loaded from the same JSON cannot finish the building again in the first copy's state.
  const again = new GameState(migrateSave(JSON.parse(JSON.stringify(restored.snapshot()))), defs, rules);
  assert.equal(new Builder(again, levels, settings).finishConstruction(pizza, 5 * MIN + left), false);
  assert.equal(restored.data.profile.exp, exp + Number(defs.get("commerce_pizza").attributes.exp));
  assert.ok(restored.data.profile.coins >= 0 && Number.isFinite(restored.data.profile.coins));
  assert.ok(house);
});
