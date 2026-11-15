import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { parseRules } from "../public/js/game/economy.js";
import { GameState, importCity, migrateSave, INITIAL_AREAS } from "../public/js/game/gameState.js";
import { Builder, parseLevels } from "../public/js/game/construction.js";
import { PlotType, buyPlot, expansionPrice, parseExpansions, parseSolidTiles, plotRect, plotsFromAreas } from "../public/js/game/expansions.js";
import { relativeToTile } from "../public/js/game/geometry.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/rules/" + p, import.meta.url)));
const exp = parseExpansions(read("expansions.json"), read("expansionsPrices.json"));
const solids = parseSolidTiles(read("universe__map.json"));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read(f)])));
const economy = parseRules(read("contracts.json"), read("contractsTypes.json"), read("settings.json"));
const levels = parseLevels(read("XPTable.json"));

function setup(coins = 10_000_000, cash = 0) {
  const file = { format: "mcity-html5-city/1", profile: { DCCoins: String(coins), DCCash: String(cash), exp: "0", cityname: "T", companyValue: "0" },
    hqLevel: 0, items: [], roads: [], terrain: [] };
  const g = new GameState(importCity(file, 0), defs, economy);
  return { g, b: new Builder(g, levels, { itemProfitPercentage: 35, terrainProfitPercentage: 100 }, solids, exp) };
}

test("expansion rules: 25 plots over 36 areas, start plot is order 0", () => {
  assert.equal(exp.rules.length, 25);
  assert.equal(new Set(exp.rules.flatMap((r) => r.areas)).size, 36);
  const start = exp.rules.find((r) => r.unlockOrder === 0);
  assert.deepEqual(start.areas, INITIAL_AREAS);
  assert.deepEqual(plotRect(start), { x: 2 * 15 * 32, y: 2 * 10 * 32, w: 2 * 15 * 32, h: 2 * 10 * 32 });
});

test("plot states: start plot full, order 1 for sale, the rest locked", () => {
  const plots = plotsFromAreas(exp.rules, INITIAL_AREAS);
  exp.rules.forEach((r) => {
    const expected = r.unlockOrder === 0 ? PlotType.Full : r.unlockOrder === 1 ? PlotType.Normal : PlotType.Locked;
    assert.equal(plots[r.index], expected, `plot ${r.index}`);
  });
  assert.deepEqual(expansionPrice(exp.prices, plots), exp.prices[0], "the first purchase uses the first price row");
});

test("buying every plot of an order opens the next order", () => {
  let plots = plotsFromAreas(exp.rules, INITIAL_AREAS);
  const order1 = exp.rules.filter((r) => r.unlockOrder === 1);
  for (const r of order1.slice(0, -1)) plots = buyPlot(exp.rules, plots, r.index);
  assert.ok(exp.rules.filter((r) => r.unlockOrder === 2).every((r) => plots[r.index] === PlotType.Locked));
  plots = buyPlot(exp.rules, plots, order1.at(-1).index);
  assert.ok(exp.rules.filter((r) => r.unlockOrder === 2).every((r) => plots[r.index] === PlotType.Normal));
  assert.deepEqual(plotsFromAreas(exp.rules, exp.rules.filter((r) => plots[r.index] === PlotType.Full).flatMap((r) => r.areas)), plots);
});

test("expansion purchase charges coins, extends buildable land and survives a save round trip", () => {
  const { g, b } = setup();
  const plot = exp.rules.find((r) => r.unlockOrder === 1);
  const locked = exp.rules.find((r) => r.unlockOrder === 2);
  const t = relativeToTile(0, 0);
  const area = plot.areas[0];
  const ax = (area % 6) * 15 + 3, ay = Math.floor(area / 6) * 10 + 3;
  assert.equal(b.canBuyTerrain(ax, ay), "not_owned");
  assert.equal(b.buyExpansion(locked.index, "coins"), false, "locked plots cannot be bought");
  assert.equal(b.buyExpansion(plot.index, "cash"), false, "no gold");
  assert.ok(b.buyExpansion(plot.index, "coins"));
  assert.equal(g.data.profile.coins, 10_000_000 - exp.prices[0].coins);
  assert.equal(b.canBuyTerrain(ax, ay), null);
  assert.equal(b.buyExpansion(plot.index, "coins"), false, "already bought");
  assert.deepEqual(b.expansionPrice(), exp.prices[1], "price index advances with full plots");
  const reloaded = new Builder(new GameState(migrateSave(JSON.parse(JSON.stringify(g.data))), defs, economy), levels,
    { itemProfitPercentage: 35, terrainProfitPercentage: 100 }, solids, exp);
  assert.equal(reloaded.plots()[plot.index], PlotType.Full);
  assert.ok(t);
});

test("too few coins: no purchase and no charge", () => {
  const { g, b } = setup(1000);
  const plot = exp.rules.find((r) => r.unlockOrder === 1);
  assert.equal(b.buyExpansion(plot.index, "coins"), false);
  assert.equal(g.data.profile.coins, 1000);
});

test("solid logic tiles from map.xml block terrain, roads and buildings", () => {
  assert.ok(solids.length > 100);
  const { g, b } = setup();
  // Own every area so that only the solid rule can refuse.
  g.data.areas = Array.from({ length: 36 }, (_, i) => i);
  const [sx, sy] = solids[0];
  const s = relativeToTile(sx, sy);
  assert.ok(b.isSolid(s.x, s.y));
  assert.equal(b.canBuyTerrain(s.x, s.y), "occupied");
  assert.equal(b.canBuildRoad(s.x, s.y), false);
  g.data.profile.exp = 1e9;
  assert.equal(b.canPlace("decorations_tree_01", s.x, s.y), "occupied");
});

test("the imported city has no item, road or plot on a solid tile, so it stays valid", () => {
  const city = JSON.parse(readFileSync(new URL("../public/data/city.json", import.meta.url)));
  const solid = new Set(solids.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of [...city.roads, ...city.terrain]) assert.ok(!solid.has(`${x},${y}`), `ground ${x},${y}`);
  for (const it of city.items) {
    const d = defs.get(it.sku);
    for (let dx = 0; dx < d.baseCols; dx++) for (let dy = 0; dy < d.baseRows; dy++) assert.ok(!solid.has(`${it.x + dx},${it.y + dy}`), `${it.sku}`);
  }
});
