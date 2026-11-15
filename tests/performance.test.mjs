import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions, definitionFiles } from "../public/js/game/definitions.js";
import { parseRules, houseInfluencePercent, influenceArea, shopCustomers } from "../public/js/game/economy.js";
import { GameState, importCity } from "../public/js/game/gameState.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(definitionFiles().map((f) => [f, read("assets/rules/" + f)])));
const rules = parseRules(read("assets/rules/contracts.json"), read("assets/rules/contractsTypes.json"), read("assets/rules/settings.json"));
const sheik = () => new GameState(importCity(read("data/npc_boss.json"), 1.8e12), defs, rules);
const overlaps = (a, f) => f.tileX < a.x1 && f.tileX + f.def.baseCols > a.x0 && f.tileY < a.y1 && f.tileY + f.def.baseRows > a.y0;

test("cached decoration influence gives the same percent as summing every decoration (Sheik's City)", () => {
  const all = sheik().footprints();
  const decos = all.filter((d) => d.def.kind === "decoration");
  let houses = 0;
  for (const h of all.filter((f) => f.def.kind === "house")) {
    const naive = decos.reduce((n, d) => n + (Number(d.def.attributes.influenceValue) && overlaps(influenceArea(d), h) ? Number(d.def.attributes.influenceValue) : 0), 0);
    assert.equal(houseInfluencePercent(h, all), naive);
    houses++;
  }
  assert.equal(houses, 129);
});

test("the influence cache belongs to one footprint list: a new list sees a new decoration", () => {
  const g = sheik();
  const house = g.footprints().find((f) => f.def.kind === "house");
  const before = houseInfluencePercent(house, g.footprints());
  const fountain = { sid: 99999, def: defs.get("decorations_font_03"), tileX: house.tileX, tileY: house.tileY - 1 };
  assert.ok(Number(fountain.def.attributes.influenceValue) > 0);
  assert.equal(houseInfluencePercent(house, [...g.footprints(), fountain]), before + Number(fountain.def.attributes.influenceValue));
});

test("all customers at once equal the per-shop customers, and advancing shops is unchanged", () => {
  const g = sheik();
  const batch = g.allCustomerSids();
  const shops = g.footprints().filter((f) => f.def.kind === "commerce");
  assert.equal(batch.size, 26);
  for (const s of shops) assert.deepEqual(batch.get(s.sid), g.customerSids(s.sid));
  const modes = new Map(g.data.items.map((i) => [i.sid, i.state?.mode]));
  const all = g.footprints();
  for (const s of shops) assert.deepEqual(batch.get(s.sid), shopCustomers(s, all, (sid) => modes.get(sid)).map((c) => c.sid));
});
