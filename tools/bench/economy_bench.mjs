// Economy step benchmark on fixed inputs: the converted original NPC cities and the test city.
// Usage: node tools/bench/economy_bench.mjs [label]   (prints JSON; compiled modules from public/js)
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { buildDefinitions, definitionFiles } from "../../public/js/game/definitions.js";
import { parseRules, houseInfluencePercent } from "../../public/js/game/economy.js";
import { GameState, importCity } from "../../public/js/game/gameState.js";

const root = new URL("../../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const defs = buildDefinitions(Object.fromEntries(definitionFiles().map((f) => [f, read("public/assets/rules/" + f)])));
const rules = parseRules(read("public/assets/rules/contracts.json"), read("public/assets/rules/contractsTypes.json"), read("public/assets/rules/settings.json"));
const T0 = 1_800_000_000_000;
const ROUNDS = 200;
const out = { label: process.argv[2] ?? "", node: process.version, rounds: ROUNDS, cities: [] };

for (const name of ["city_test", "npc_advisor", "npc_boss"]) {
  const file = read(`public/data/${name}.json`);
  const fresh = () => new GameState(importCity(file, T0), defs, rules);
  const probe = fresh();
  const fp = probe.footprints();
  const shops = fp.filter((f) => f.def.kind === "commerce");
  const houses = fp.filter((f) => f.def.kind === "house");
  // The scene's once-per-second work: advance all timers, then the mission inputs (customers per shop, influence per house).
  const step = (g, now) => {
    g.advance(now);
    let n = 0;
    // The scene asks for all customers at once when the batch call exists (phase 5), otherwise per shop (before).
    if (g.allCustomerSids) for (const c of g.allCustomerSids().values()) n += c.length;
    else for (const s of shops) n += g.customerSids(s.sid).length;
    const all = g.footprints();
    for (const h of houses) n += houseInfluencePercent(h, all);
    return n;
  };
  const g = fresh();
  let checksum = 0;
  for (let i = 0; i < 20; i++) checksum += step(g, T0 + i * 1000);
  const g2 = fresh();
  const heap0 = process.memoryUsage().heapUsed;
  const t = performance.now();
  checksum = 0;
  for (let i = 0; i < ROUNDS; i++) checksum += step(g2, T0 + i * 1000);
  const ms = performance.now() - t;
  out.cities.push({ name, items: file.items.length, shops: shops.length, houses: houses.length, msPerStep: +(ms / ROUNDS).toFixed(4),
    checksum, stateSha: createHash("sha256").update(JSON.stringify(g2.data)).digest("hex").slice(0, 16), heapDeltaKB: Math.round((process.memoryUsage().heapUsed - heap0) / 1024) });
}
console.log(JSON.stringify(out, null, 1));
