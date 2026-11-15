import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { parseRules, Mode, houseIncome, houseInfluencePercent } from "../public/js/game/economy.js";
import { GameState, importCity, validateSave } from "../public/js/game/gameState.js";
import { relativeToTile } from "../public/js/game/geometry.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const rules = parseRules(read("rules/contracts.json"), read("rules/contractsTypes.json"), read("rules/settings.json"));
const H = 3_600_000;

function city(items) {
  return { format: "mcity-html5-city/1", profile: { DCCoins: "100000", DCCash: "0", exp: "1000", cityname: "T", companyValue: "0" },
    hqLevel: 0, items, roads: [], terrain: [] };
}

test("contracts come from contracts.xml", () => {
  const c = rules.contracts.get("18");
  assert.deepEqual([c.costCoins, c.incomeCoins, c.incomeXp, c.incomeTimeMs], [7500, 23805, 72, 72 * H]);
  assert.equal(rules.settings.abandonMinTimeMs, 60 * 60_000);
  assert.equal(rules.contracts.get("19").costCoins, 97, "fractional costs are truncated like the client's encrypted ints");
  assert.deepEqual(rules.contractsByType.get("2").slice(-1), ["18"]);
});

test("decoration influence raises house rent by its percentage", () => {
  const house = { sid: 1, def: defs.get("houses_001_002"), tileX: 10, tileY: 10 };
  const fountain = { sid: 2, def: defs.get("decorations_font_02"), tileX: 13, tileY: 10 };
  const far = { sid: 3, def: defs.get("decorations_font_02"), tileX: 30, tileY: 30 };
  assert.equal(houseInfluencePercent(house, [house, fountain, far]), 14);
  const income = houseIncome(house.def, rules.contracts.get("18"), 14);
  assert.equal(income.coins, 23805 + Math.trunc(23805 * 14 / 100));
  assert.equal(income.xp, 72);
});

test("rent cycle: renting -> ready -> collected once -> waiting for contract", () => {
  const t0 = 1_000_000;
  const data = importCity(city([{ sid: 7, sku: "houses_001_002", x: 0, y: 0,
    state: { id: "1", mode: "4", time: String(2 * H), contractSku: "18", savedAt: String(t0) } }]), t0);
  const g = new GameState(data, defs, rules);
  assert.equal(g.collectRent(7, t0 + H), null, "not ready yet");
  assert.equal(g.item(7).state.mode, Mode.Renting);
  assert.equal(g.item(7).state.timeMs, H);
  const coins = data.profile.coins;
  const r = g.collectRent(7, t0 + 2 * H + 1000);
  assert.deepEqual(r, { coins: 23805, xp: 72 });
  assert.equal(data.profile.coins, coins + 23805);
  assert.equal(g.item(7).state.mode, Mode.WaitingForContract);
  assert.equal(g.collectRent(7, t0 + 2 * H + 2000), null, "second collect pays nothing");
  assert.equal(data.profile.coins, coins + 23805);
});

test("a paid cycle restored from an older save copy is not paid again", () => {
  const t0 = 5_000;
  const data = importCity(city([{ sid: 9, sku: "houses_001_002", x: 0, y: 0,
    state: { id: "1", mode: "5", time: String(H), contractSku: "18", savedAt: String(t0) } }]), t0);
  const g = new GameState(data, defs, rules);
  const before = g.snapshot();
  assert.ok(g.collectRent(9, t0 + 1000));
  const after = g.snapshot();
  const replay = new GameState({ ...before, paidCycles: after.paidCycles }, defs, rules);
  assert.equal(replay.collectRent(9, t0 + 2000), null);
});

test("uncollected rent is abandoned after the abandon time", () => {
  const t0 = 0;
  const data = importCity(city([{ sid: 4, sku: "houses_001_002", x: 0, y: 0,
    state: { id: "1", mode: "4", time: String(H), contractSku: "18", savedAt: String(t0) } }]), t0);
  const g = new GameState(data, defs, rules);
  g.advance(t0 + H + 71 * H);
  assert.equal(g.item(4).state.mode, Mode.GetRent);
  g.advance(t0 + H + 72 * H);
  assert.equal(g.item(4).state.mode, Mode.Abandoned);
  assert.equal(g.collectRent(4, t0 + 80 * H), null);
});

test("signing a contract costs coins and starts renting after 3 s", () => {
  const data = importCity(city([{ sid: 5, sku: "houses_001_002", x: 0, y: 0, state: { id: "1", mode: "1", time: "0" } }]), 0);
  const g = new GameState(data, defs, rules);
  assert.equal(g.signContract(5, "1", 100), false, "contract of another house type");
  assert.equal(g.signContract(5, "18", 100), true);
  assert.equal(data.profile.coins, 100000 - 7500);
  assert.equal(g.signContract(5, "18", 200), false, "already signing");
  g.advance(3100);
  assert.equal(g.item(5).state.mode, Mode.Renting);
  assert.equal(g.item(5).state.timeMs, 72 * H);
  g.advance(3100 + 72 * H);
  assert.equal(g.item(5).state.mode, Mode.GetRent);
});

test("timers advance identically whatever the update rate", () => {
  const mk = () => new GameState(importCity(city([{ sid: 1, sku: "houses_001_002", x: 0, y: 0,
    state: { id: "1", mode: "4", time: String(H), contractSku: "18", savedAt: "0" } }]), 0), defs, rules);
  const a = mk(), b = mk();
  for (let t = 0; t <= 2 * H; t += 16) a.advance(t);
  b.advance(2 * H);
  assert.deepEqual(a.item(1).state, b.item(1).state);
});

test("save validation rejects malformed data", () => {
  const ok = importCity(city([]), 0);
  assert.equal(validateSave(ok), true);
  assert.equal(validateSave({ ...ok, version: 99 }), false);
  assert.equal(validateSave({ ...ok, items: [{ sid: "x" }] }), false);
  assert.equal(validateSave(null), false);
});

test("imported save copy keeps the original values", () => {
  const file = JSON.parse(readFileSync(new URL("../public/data/city.json", import.meta.url)));
  const data = importCity(file, Date.now());
  assert.equal(data.profile.coins, Number(file.profile.DCCoins));
  assert.equal(data.profile.exp, Number(file.profile.exp));
  assert.equal(data.items.length, file.items.length);
  const house = data.items.find((i) => i.sku === "houses_004_001");
  const src = file.items.find((i) => i.sid === house.sid);
  assert.equal(house.state.timeMs, Number(src.state.time));
  assert.equal(house.state.contractSku, src.state.contractSku);
  assert.deepEqual(relativeToTile(house.x, house.y), relativeToTile(src.x, src.y));
});
