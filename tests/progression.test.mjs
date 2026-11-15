import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelForExp, parseXpTable, formatNumber } from "../public/js/game/progression.js";

const table = parseXpTable(JSON.parse(readFileSync(new URL("../public/assets/rules/XPTable.json", import.meta.url))));

test("levels follow XPTable.xml thresholds", () => {
  assert.deepEqual(table.slice(0, 4), [0, 470, 1010, 1580]);
  assert.equal(levelForExp(table, 0).level, 1);
  assert.equal(levelForExp(table, 469).level, 1);
  assert.equal(levelForExp(table, 470).level, 2);
  const l = levelForExp(table, 1476);
  assert.equal(l.level, 3);
  assert.ok(Math.abs(l.progress - (1476 - 1010) / (1580 - 1010)) < 1e-12);
  const top = levelForExp(table, 1e12);
  assert.equal(top.level, table.length);
  assert.equal(top.nextLevelExp, null);
  assert.equal(top.progress, 1);
});

test("numbers use thousands separators like the original HUD", () => {
  assert.equal(formatNumber(30789), "30,789");
  assert.equal(formatNumber(1158689), "1,158,689");
  assert.equal(formatNumber(0), "0");
});
