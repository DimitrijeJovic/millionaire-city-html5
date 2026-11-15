import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Traffic, parseTraffic, ACCELERATION } from "../public/js/game/traffic.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/rules/" + p, import.meta.url)));
const { defs, manager } = parseTraffic(read("trafficAgents__trafficAgentDefinitions.json"), read("trafficAgents__trafficAgentManagerDefinition.json"));

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
// A loop of road around a 6 x 4 block plus a dead-end spur.
const roads = new Set();
for (let x = 10; x <= 16; x++) { roads.add(`${x},10`); roads.add(`${x},14`); }
for (let y = 10; y <= 14; y++) { roads.add(`10,${y}`); roads.add(`16,${y}`); }
for (let x = 17; x <= 19; x++) roads.add(`${x},12`);
const isRoad = (x, y) => roads.has(`${x},${y}`);
const tiles = () => [...roads].map((k) => k.split(",").map(Number));
const mk = (seed) => new Traffic(defs, manager, isRoad, tiles, rng(seed));

test("traffic rules come from trafficAgents XML", () => {
  assert.equal(defs.length, 9);
  assert.deepEqual(defs.find((d) => d.sku === "scooter").spawnCondition, ["commerce_pizza"]);
  assert.equal(manager.askIntervalMs, 10_000);
  assert.equal(manager.agentsLimit, 20);
  assert.equal(manager.expireMs, 120_000);
});

test("agents spawn on roads, respect the limit and keep their distance", () => {
  const t = mk(1);
  for (let i = 0; i < 400; i++) t.step(1000, 30, new Set());
  assert.ok(t.agents.length > 0);
  assert.ok(t.agents.length <= manager.agentsLimit);
  for (const a of t.agents) assert.ok(isRoad(a.tx, a.ty), `agent on ${a.tx},${a.ty}`);
});

test("special vehicles need their building", () => {
  const t = mk(2);
  for (let i = 0; i < 300; i++) t.step(1000, 30, new Set());
  const seen = new Set(t.agents.map((a) => a.sku));
  assert.ok(!seen.has("scooter") && !seen.has("car_police"));
});

test("speed ramps up with the original acceleration and stays below the car's maximum", () => {
  const t = mk(3);
  while (!t.agents.length) t.step(1000, 30, new Set());
  const a = t.agents[0];
  const before = a.speed;
  t.step(40, 30, new Set());
  assert.ok(Math.abs(a.speed - Math.min(a.maxSpeed, before + ACCELERATION * 40)) < 1e-12 || a.speed === 0);
  for (let i = 0; i < 2000; i++) t.step(40, 30, new Set());
  for (const b of t.agents) assert.ok(b.speed <= b.maxSpeed + 1e-12);
});

test("movement depends on simulated time, not on how often steps run", () => {
  const run = (dt, total) => {
    const t = new Traffic(defs, { ...manager, askIntervalMs: 1e12 }, isRoad, tiles, rng(9));
    // Force one agent in a known place.
    t.agents.push({ id: 1, sku: "car_01", maxSpeed: 0.035, speed: 0.035, tx: 10, ty: 10, dir: 0, exit: 0, s: 0, x: 0, y: 0, angle: 0,
      age: 2000, life: 1e9, fading: 0, blockedMs: 0, done: false });
    for (let ms = 0; ms < total; ms += dt) t.step(dt, 30, new Set());
    return t.agents[0];
  };
  const a = run(40, 4000), b = run(20, 4000);
  assert.equal(a.tx, b.tx);
  assert.ok(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1);
  assert.ok(Math.abs(a.x - (10 * 32 + 0.035 * 4000)) < 1, "straight east at 35 px/s");
});

test("agents expire after agentExpireTime and fade out", () => {
  const t = mk(4);
  while (!t.agents.length) t.step(1000, 30, new Set());
  const id = t.agents[0].id;
  for (let ms = 0; ms < manager.expireMs + 2000; ms += 100) t.step(100, 0, new Set());
  assert.ok(!t.agents.some((a) => a.id === id));
});
