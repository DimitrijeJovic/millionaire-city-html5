import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { neighborPage, FRIENDS_PER_PAGE } from "../public/js/ui/BottomBar.js";
import { specialTabItems, isAllowedInShop } from "../public/js/game/shop.js";
import { companyValueParts } from "../public/js/game/companyValue.js";
import { mapInfoAnchor, mapInfoKind, mapInfoView, INFO_BOX_DELAY_MS } from "../public/js/game/mapInfo.js";
import { convertTimeToString, localeTimeUnits } from "../public/js/game/textFormat.js";
import { spawnNote, stepRain, NOTE_TYPES, BACKGROUND_NOTES, FOREGROUND_NOTES, RAIN_FPS } from "../public/js/game/noteRain.js";
import { adjustResource, cleanProfileName, parseLocalProfile, parseResourceDelta, RESOURCE_ADJUSTMENT_MAX } from "../public/js/game/localProfile.js";
import { Mode } from "../public/js/game/economy.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const locale = read("locale/en.json");
const t = (tid, fb) => locale[tid] ?? fb;
const npc = (name, cv, myself = false) => ({ name, companyValue: cv, level: 23, photo: null, myself });

test("FriendsBar page: 8 places, highest company value on the right, empty Add Neighbors places on the left", () => {
  const page = neighborPage([npc("Mayor", 1_200_000, true), npc("Ronald", 100_000_000), npc("Sheik", 900_000_000)], 0);
  assert.equal(page.length, FRIENDS_PER_PAGE);
  assert.deepEqual(page.slice(0, 5), [null, null, null, null, null]);
  assert.deepEqual(page.slice(5).map((n) => [n.name, n.rank]), [["Mayor", 3], ["Ronald", 2], ["Sheik", 1]]);
});

test("FriendsBar page: more than 8 neighbours page from the highest ranks", () => {
  const list = Array.from({ length: 11 }, (_, i) => npc("n" + i, i));
  const first = neighborPage(list, 0);
  const last = neighborPage(list, 1);
  assert.deepEqual(first.map((n) => n && n.rank), [null, null, null, null, null, 11, 10, 9]);
  assert.deepEqual(last.map((n) => n.rank), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(neighborPage(list, 99), last);
});

test("Shop specials: 8 featured items and 7 Skyscraper Week items, all of which expired on 16.01.2012", () => {
  const featured = specialTabItems(defs, "featured");
  const week = specialTabItems(defs, "new_items");
  assert.equal(featured.length, 8);
  assert.equal(week.length, 7);
  const now = Date.UTC(2026, 9, 30);
  assert.equal(week.every((d) => !isAllowedInShop(d, now)), true);
  assert.equal(week.every((d) => isAllowedInShop(d, Date.UTC(2012, 0, 10))), true);
});

test("Company value: coins + gold x cashToCoins + buildings (with running contract cost) + plots and expansions", () => {
  const v = companyValueParts({
    coins: 22_559, cash: 2, cashToCoins: 60_000,
    items: [
      { companyValue: 1000, contractCost: 50, underConstruction: false },
      { companyValue: 500, contractCost: 0, underConstruction: true },
      { companyValue: 0, contractCost: 0, underConstruction: false },
    ],
    terrainTiles: 10, terrainPrice: 300, expansionCash: [10, 20, 30], expansionsBought: 2,
  });
  assert.deepEqual(v, { coins: 22_559, gold: 120_000, buildings: 1050, terrain: 3000 + 30 * 60_000, total: 22_559 + 120_000 + 1050 + 1_803_000 });
});

test("Map info box kind follows StateOnRent.doInfoBoxGetBox", () => {
  assert.equal(mapInfoKind("house", Mode.Renting), "house");
  assert.equal(mapInfoKind("house", Mode.GetRent), "house");
  assert.equal(mapInfoKind("house", Mode.WaitingForContract), null);
  assert.equal(mapInfoKind("commerce", Mode.Renting), "commerce");
  assert.equal(mapInfoKind("decoration", undefined), null);
  assert.equal(INFO_BOX_DELAY_MS, 400);
});

test("House info box texts and colours (InfoBoxHouse)", () => {
  const v = mapInfoView({ kind: "house", title: "Townhouse", periodMs: 2 * 86_400_000, leftMs: 86_400_000 + 4 * 3_600_000, income: 12_345,
    xp: 0, attendance: 12 }, t);
  assert.equal(v.texts.Status, "Tenants:");
  assert.equal(v.texts.IncomeIn, "1 Day 4 Hours");
  assert.equal(v.texts.DailyXP, "0 XP");
  assert.equal(v.texts.DailyIncomeMoney, "$12,345");
  assert.equal(v.texts.attendance_number, "12");
  assert.equal(v.colors.DailyXP, "#ff0000");
  assert.ok(Math.abs(v.fill - (20 / 48)) < 1e-9);
  const zero = mapInfoView({ kind: "house", title: "x", periodMs: 1, leftMs: 0, income: 0, xp: 5, attendance: 0 }, t);
  assert.equal(zero.colors.DailyIncomeMoney, "#00ff00");
  assert.equal(zero.colors.attendance_number, "#00ff00");
});

test("Commerce info box texts and colours (InfoBoxCommerce)", () => {
  const v = mapInfoView({ kind: "commerce", title: "Pizzeria", periodMs: 5 * 60_000, leftMs: 2 * 60_000 + 4_000, income: 0, xp: 0, attendance: 0 }, t);
  assert.equal(v.texts.Income_Bonus, "Income");
  assert.equal(v.texts.attendance, "Customers:");
  assert.equal(v.texts.IncomeIn, "2 Mins 4 Secs");
  assert.equal(v.colors.DailyIncomeMoney, "#ff0000");
  assert.equal(v.colors.attendance_number, "#ff0000");
});

test("convertTimeToString with short = false keeps zero minutes and seconds", () => {
  const u = localeTimeUnits(t);
  assert.equal(convertTimeToString(5_000, u, false, false), "0 Mins 5 Secs");
  assert.equal(convertTimeToString(120_000, u, false, false), "2 Mins 0 Secs");
  assert.equal(convertTimeToString(120_000, u), "2 Mins");
  assert.equal(convertTimeToString(3_600_000 + 60_000, u, false, false), "1 Hour 1 Mins");
});

test("Map info box opens on the right of the item unless it would leave the stage", () => {
  assert.deepEqual(mapInfoAnchor({ left: 100, right: 200, top: 50, bottom: 150 }, 251, 1280), { side: "right", x: 200, y: 100 });
  assert.deepEqual(mapInfoAnchor({ left: 1000, right: 1100, top: 50, bottom: 150 }, 251, 1280), { side: "left", x: 1000, y: 100 });
});

test("NoteRain: notes start above the stage, fall 5-15 px per 25 fps frame and are replaced only while raining", () => {
  const seq = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  let i = 0;
  const rnd = () => seq[i++ % seq.length];
  const n = spawnNote(NOTE_TYPES.background, () => 40, 1280, 720, rnd);
  assert.ok(NOTE_TYPES.background.includes(n.type));
  assert.equal(n.y, -(40 + 10) - 0.5 * 360);
  assert.equal(n.x, 0.5 * (1280 + 200) - 100);
  assert.equal(n.speed, 10);
  assert.equal(BACKGROUND_NOTES, 50);
  assert.equal(FOREGROUND_NOTES, 10);
  assert.equal(RAIN_FPS, 25);
  const notes = [{ ...n, y: 899, speed: 5 }];
  assert.equal(stepRain(notes, true, () => ({ ...n }), 720), true);
  assert.equal(notes[0].y, n.y);
  const ending = [{ ...n, y: 899, speed: 5 }];
  assert.equal(stepRain(ending, false, () => ({ ...n }), 720), false);
  assert.equal(ending.length, 0);
});

test("Local profile: launcher resource rules", () => {
  const p = { coins: 100, cash: 1, exp: 50, companyValue: 1000 };
  adjustResource(p, "money", 500, 60_000);
  assert.deepEqual(p, { coins: 600, cash: 1, exp: 50, companyValue: 1500 });
  adjustResource(p, "money", -10_000, 60_000);
  assert.deepEqual(p, { coins: 0, cash: 1, exp: 50, companyValue: 900 });
  adjustResource(p, "gold", 2, 60_000);
  assert.equal(p.cash, 3);
  assert.equal(p.companyValue, 900 + 120_000);
  adjustResource(p, "xp", -100, 60_000);
  assert.equal(p.exp, 0);
  assert.equal(parseResourceDelta("0"), null);
  assert.equal(parseResourceDelta("1.5"), null);
  assert.equal(parseResourceDelta(String(RESOURCE_ADJUSTMENT_MAX + 1)), null);
  assert.equal(parseResourceDelta("250"), 250);
  assert.equal(cleanProfileName("   ", "Mayor"), "Mayor");
  assert.equal(cleanProfileName("x".repeat(40), "Mayor").length, 32);
  assert.deepEqual(parseLocalProfile("{bad"), { userName: "Mayor", picture: null });
  assert.equal(parseLocalProfile(JSON.stringify({ userName: "A", picture: "javascript:alert(1)" })).picture, null);
});
