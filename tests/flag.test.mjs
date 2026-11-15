import { test } from "node:test";
import assert from "node:assert/strict";
import { FlagWave, stripColumns } from "../public/js/game/flag.js";

test("flag wave: strip 1 follows 4 * sin(0.01 - t * 0.002), the others copy their neighbour, strip 0 stays", () => {
  const f = new FlagWave();
  assert.equal(f.strips, 20);
  f.update(40);
  assert.ok(Math.abs(f.ys[1] - 4 * Math.sin(0.01 - 40 * 0.002)) < 1e-12);
  assert.equal(f.ys[2], 0);
  const first = f.ys[1];
  f.update(40);
  assert.equal(f.ys[2], first, "the wave moves one strip per update");
  assert.ok(Math.abs(f.ys[1] - 4 * Math.sin(0.01 - 80 * 0.002)) < 1e-12);
  for (let i = 0; i < 100; i++) f.update(40);
  assert.equal(f.ys[0], 0);
  assert.ok(f.ys.every((y) => Math.abs(y) <= 4));
  const before = [...f.ys];
  f.update(0);
  assert.deepEqual(f.ys, before, "no time, no change");
});

test("flag strips: masks of width w + 8 over the bitmap shifted by width / 8", () => {
  const W = 244;
  const w = W / 20;
  // The bitmap starts at width / 8, so the first masks cover nothing and those strips stay empty.
  const [a0, b0] = stripColumns(0, 20, W);
  assert.ok(b0 <= a0);
  const [a, b] = stripColumns(10, 20, W);
  assert.ok(Math.abs(a - (10 * w - 4 - W / 8)) < 1e-9 && Math.abs(b - a - (w + 8)) < 1e-9);
  assert.equal(stripColumns(19, 20, W)[1], 20 * w + 4 - W / 8);
});
