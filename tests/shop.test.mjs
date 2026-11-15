import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { parseRules, Mode, itemIncomeTimeMs } from "../public/js/game/economy.js";
import { GameState, importCity } from "../public/js/game/gameState.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const rules = parseRules(read("rules/contracts.json"), read("rules/contractsTypes.json"), read("rules/settings.json"));
const MIN = 60_000;
const H = 60 * MIN;
const renting = (t0) => ({ id: "1", mode: "4", time: String(10 * H), contractSku: "18", savedAt: String(t0) });

function game(items, t0 = 0) {
  const file = { format: "mcity-html5-city/1", profile: { DCCoins: "1000", DCCash: "0", exp: "0", cityname: "T", companyValue: "0" },
    hqLevel: 0, items, roads: [], terrain: [] };
  return new GameState(importCity(file, t0), defs, rules);
}

// Pizza 3x3 at relative (0,0) with influenceRatio 2 reaches relative x/y -2..4.
const pizza = (state) => ({ sid: 1, sku: "commerce_pizza", x: 0, y: 0, state });
const shopTimer = (t0) => ({ id: "1", mode: "4", time: String(3 * MIN), savedAt: String(t0) });

test("shop income time is in minutes", () => {
  assert.equal(itemIncomeTimeMs(defs.get("commerce_pizza")), 3 * MIN);
  assert.equal(itemIncomeTimeMs(defs.get("houses_001_002")), Number(defs.get("houses_001_002").attributes.incomeTime) * H);
});

test("shop pays incomeValue x tenants for every renting house in its area", () => {
  const g = game([pizza(shopTimer(0)), { sid: 2, sku: "houses_001_002", x: 3, y: 0, state: renting(0) },
    { sid: 3, sku: "houses_002_001", x: -4, y: 0, state: renting(0) },
    { sid: 4, sku: "houses_001_002", x: 20, y: 0, state: renting(0) }]);
  g.advance(3 * MIN);
  assert.equal(g.item(1).state.mode, Mode.GetRent);
  assert.deepEqual(g.customerSids(1).sort(), [2, 3]);
  const tenants = (sku) => Number(defs.get(sku).attributes.tenants);
  const expected = 40 * (tenants("houses_001_002") + tenants("houses_002_001"));
  const coins = g.data.profile.coins;
  assert.deepEqual(g.collect(1, 3 * MIN + 1), { coins: expected, xp: 0 });
  assert.equal(g.data.profile.coins, coins + expected);
  assert.equal(g.item(1).state.mode, Mode.Renting);
  assert.equal(g.item(1).state.timeMs, 3 * MIN);
  assert.equal(g.collect(1, 3 * MIN + 2), null, "same period cannot be collected twice");
});

test("a shop without customers starts a new period instead of becoming ready", () => {
  const g = game([pizza(shopTimer(0)), { sid: 2, sku: "houses_001_002", x: 3, y: 0, state: { id: "1", mode: "1", time: "0" } }]);
  g.advance(7 * MIN);
  assert.equal(g.item(1).state.mode, Mode.Renting);
  assert.equal(g.item(1).state.timeMs, 2 * MIN, "7 min = 2 empty periods + 1 min into the third");
  assert.equal(g.collect(1, 7 * MIN), null);
});

test("ready shop income falls back to renting when its customers leave", () => {
  const g = game([pizza(shopTimer(0)), { sid: 2, sku: "houses_001_002", x: 3, y: 0,
    state: { id: "1", mode: "5", time: String(H), contractSku: "18", savedAt: "0" } }]);
  g.advance(3 * MIN);
  assert.equal(g.item(1).state.mode, Mode.GetRent);
  assert.ok(g.collect(2, 3 * MIN + 10), "house rent collected, house now waits for a contract");
  g.advance(3 * MIN + 20);
  assert.equal(g.item(1).state.mode, Mode.Renting);
});

test("shop collection survives save and reload without a second payment", () => {
  const g = game([pizza(shopTimer(0)), { sid: 2, sku: "houses_001_002", x: 3, y: 0, state: renting(0) }]);
  g.advance(3 * MIN);
  const beforeCollect = g.snapshot();
  assert.ok(g.collect(1, 3 * MIN));
  const saved = JSON.parse(JSON.stringify(g.snapshot()));
  const reloaded = new GameState(saved, defs, rules);
  assert.equal(reloaded.collect(1, 3 * MIN + 5), null);
  const stale = new GameState({ ...beforeCollect, paidCycles: saved.paidCycles }, defs, rules);
  assert.equal(stale.collect(1, 3 * MIN + 5), null, "older copy of the save cannot replay the payment");
  assert.ok(reloaded.collect(1, 6 * MIN + 5), "next period pays again");
});

test("shop timers are independent of the update rate", () => {
  const mk = () => game([pizza(shopTimer(0)), { sid: 2, sku: "houses_001_002", x: 3, y: 0, state: renting(0) }]);
  const a = mk(), b = mk();
  for (let t = 0; t <= 2 * MIN; t += 16) a.advance(t);
  b.advance(2 * MIN);
  assert.deepEqual(a.item(1).state, b.item(1).state);
});

test("status icons follow TopLayer's frame table and sit centred on the base", async () => {
  const { iconFrameAt, iconTopLeft } = await import("../public/js/game/statusIcons.js");
  const seq = [0, 149, 150, 279, 280, 409, 410, 559, 560, 689, 690, 819, 820].map(iconFrameAt);
  assert.deepEqual(seq, [0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 0]);
  assert.deepEqual(iconTopLeft(320, 640, 96, 96), [320 + 10.5, 640 + 10.5]);
});
