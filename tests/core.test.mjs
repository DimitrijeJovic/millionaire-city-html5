import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainForm, tileValue, valueToTilesetIndex, applyCrosswalks, GroundType } from "../public/js/game/autotile.js";
import { FixedStepClock } from "../public/js/game/clock.js";
import { frameAt, clipDurationMs } from "../public/js/game/animation.js";
import { ZoomController, ZOOM_LEVELS } from "../public/js/game/camera.js";
import { AudioEvents, SoundId } from "../public/js/audio/AudioEvents.js";
import { relativeToTile, tileToRelative, MAP_COLS, MAP_ROWS } from "../public/js/game/geometry.js";
import { CityModel } from "../public/js/game/city.js";
import { buildDefinitions } from "../public/js/game/definitions.js";

const parse = (list) => {
  const set = new Set(list.split(" ").filter(Boolean));
  return { n: set.has("n"), s: set.has("s"), e: set.has("e"), w: set.has("w"), ne: set.has("ne"), nw: set.has("nw"), se: set.has("se"), sw: set.has("sw") };
};

test("terrain forms follow Map.getTileTerrainForm", () => {
  assert.equal(terrainForm(parse("")), 15);
  assert.equal(terrainForm(parse("e w")), 10);
  assert.equal(terrainForm(parse("n s")), 9);
  assert.equal(terrainForm(parse("n s e w")), 16);
  assert.equal(terrainForm(parse("n s e w ne nw se sw")), 4);
  assert.equal(terrainForm(parse("n s w")), 17);
  assert.equal(terrainForm(parse("n s e")), 18);
  assert.equal(terrainForm(parse("e w n")), 19);
  assert.equal(terrainForm(parse("e w s")), 20);
  assert.equal(terrainForm(parse("e s se")), 0);
  assert.equal(terrainForm(parse("w s sw")), 2);
});

test("every neighbour combination maps to one of the 47 forms", () => {
  const seen = new Set();
  const keys = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  for (let m = 0; m < 256; m++) {
    const n = {};
    keys.forEach((k, i) => (n[k] = Boolean(m & (1 << i))));
    const f = terrainForm(n);
    assert.ok(f >= 0 && f <= 46);
    seen.add(f);
  }
  assert.equal(seen.size, 47);
});

test("tile values use the original offsets and tileset indices", () => {
  assert.equal(tileValue(GroundType.Road, parse("e w")), 72);
  assert.equal(valueToTilesetIndex(72), 71);
  assert.equal(tileValue(GroundType.Terrain, parse("")), 29);
  assert.equal(valueToTilesetIndex(0), -1);
  assert.equal(valueToTilesetIndex(1), -1);
  assert.equal(valueToTilesetIndex(2), 1);
});

test("crosswalks are placed around 4-way and T junctions", () => {
  const cols = 5, rows = 5, road = 62;
  const v = new Int16Array(cols * rows);
  v[2 * cols + 2] = road + 16;
  v[2 * cols + 1] = road + 10;
  v[2 * cols + 3] = road + 10;
  v[1 * cols + 2] = road + 9;
  v[3 * cols + 2] = road + 9;
  applyCrosswalks(v, cols, rows);
  assert.deepEqual([v[2 * cols + 1], v[2 * cols + 3], v[1 * cols + 2], v[3 * cols + 2]], [2, 2, 3, 3]);
  const t18 = new Int16Array(cols * rows);
  t18[2 * cols + 2] = road + 18;
  t18[2 * cols + 3] = road + 10;
  applyCrosswalks(t18, cols, rows);
  assert.equal(t18[2 * cols + 3], road + 10, "form 18 gets no crosswalk in the original");
});

test("fixed-step clock advances the same simulated time at 30, 60 and 144 fps", () => {
  for (const fps of [30, 60, 144, 240]) {
    const clock = new FixedStepClock(40);
    let steps = 0;
    for (let i = 0; i < fps * 10; i++) steps += clock.advance(1000 / fps);
    assert.ok(Math.abs(steps - 250) <= 1, `fps ${fps}: ${steps}`);
  }
});

test("clock caps catch-up after a long stall", () => {
  const clock = new FixedStepClock(40, 100);
  assert.equal(clock.advance(60_000), 100);
  assert.equal(clock.advance(40), 1);
});

test("animation frame depends on elapsed time only", () => {
  const clip = { frames: 30, fps: 25, loop: true };
  assert.equal(clipDurationMs(clip), 1200);
  for (const fps of [30, 60, 144]) {
    const clock = new FixedStepClock(40);
    // 1020 ms lies mid-step, so float rounding of the frame deltas cannot move the step boundary.
    for (let i = 0; i < fps * 1.02; i++) clock.advance(1000 / fps);
    assert.equal(frameAt(clip, clock.simulatedMs), 25, `fps ${fps}`);
  }
  assert.equal(frameAt(clip, 1200), 0);
  assert.equal(frameAt({ frames: 4, fps: 25, loop: false }, 10_000), 3);
});

test("zoom steps through the original levels at 1.25 units per second", () => {
  const z = new ZoomController();
  assert.deepEqual([...ZOOM_LEVELS], [1, 0.75, 0.5, 0.4, 0.3, 0.25]);
  z.zoomOut();
  z.update(100);
  assert.ok(Math.abs(z.current - 0.875) < 1e-9);
  z.update(1000);
  assert.equal(z.current, 0.75);
  for (let i = 0; i < 10; i++) z.zoomOut();
  assert.equal(z.target, 0.25);
  for (let i = 0; i < 10; i++) z.zoomIn();
  assert.equal(z.target, 1);
});

test("audio events suppress duplicates and never play music as an effect", () => {
  const played = [];
  let now = 0;
  const a = new AudioEvents({ play: (id, loop) => played.push([id, loop]), stop: (id) => played.push(["stop", id]) }, () => now);
  assert.equal(a.sfx(SoundId.Income), true);
  assert.equal(a.sfx(SoundId.Income), false);
  now = 200;
  assert.equal(a.sfx(SoundId.Income), true);
  assert.equal(a.sfx(SoundId.MainMusic), false);
  a.music(SoundId.MainMusic);
  a.music(SoundId.MainMusic);
  a.music(SoundId.RonaldMusic);
  assert.deepEqual(played, [["Income_Sound", false], ["Income_Sound", false], ["Main_Music", true], ["stop", "Main_Music"], ["Ronald_Music", true]]);
});

test("relative save coordinates map to map tiles around the centre", () => {
  assert.deepEqual(relativeToTile(0, 0), { x: 45, y: 30 });
  assert.deepEqual(tileToRelative(45, 30), { x: 0, y: 0 });
  assert.equal(MAP_COLS, 90);
  assert.equal(MAP_ROWS, 60);
});

test("city fixture loads with every item defined", () => {
  const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
  const rules = {};
  for (const f of ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"]) {
    rules[f] = read("../public/assets/rules/" + f);
  }
  const defs = buildDefinitions(rules);
  const city = new CityModel(read("../public/data/city.json"), defs);
  assert.equal(city.missingDefinitions.length, 0);
  assert.equal(city.items.length, 68);
  assert.equal(defs.get("HeadQuarter").kind, "headquarters");
  assert.equal(defs.get("decorations_font_02").isAnimated, true);
  const idx = city.tileIndices();
  assert.ok(idx.some((i) => i === 1 || i === 2), "crosswalks present");
  assert.throws(() => new CityModel({ format: "other" }, defs));
});

test("city parameter: own city by default, test copies as city_<name>, converted NPC cities by their own name", async () => {
  const { cityDataFile } = await import("../public/js/game/city.js");
  assert.equal(cityDataFile(null), "data/city.json");
  assert.equal(cityDataFile("test"), "data/city_test.json");
  assert.equal(cityDataFile("npc_boss"), "data/npc_boss.json");
  assert.equal(cityDataFile("../secret"), "data/city.json", "no path characters");
});
