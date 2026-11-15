import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { boxPosition, isAllowedInShop, parseRulesDate, shopItems, shopPriceLabel, SHOP_TABS } from "../public/js/game/shop.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const NOW = Date.UTC(2026, 9, 30);

test("shop prices are formatted like TextManager.convertNumberToString", () => {
  assert.equal(shopPriceLabel(60000), "60,000");
  assert.equal(shopPriceLabel(1234567), "1,234,567");
  assert.equal(shopPriceLabel(12_000_000), "12M");
  assert.equal(shopPriceLabel(15_500_000), "16M", "only values below 10 keep two decimals");
  assert.equal(shopPriceLabel(2_500_000), "2,500,000", "7 digits stay unshortened");
  assert.equal(shopPriceLabel(25_000_000), "25M");
  assert.equal(shopPriceLabel(0), "0");
});

test("rules dates and shop filters", () => {
  assert.equal(parseRulesDate("24:12:2010"), Date.UTC(2010, 11, 24));
  assert.equal(parseRulesDate("31:12:2011:23:59:59"), Date.UTC(2011, 11, 31, 23, 59, 59));
  assert.equal(isAllowedInShop(defs.get("HeadQuarter"), NOW), false);
  assert.equal(isAllowedInShop(defs.get("houses_001_001"), NOW), true);
  const gift = [...defs.values()].find((d) => d.attributes.freeGift === "1");
  assert.equal(isAllowedInShop(gift, NOW), false);
  const expiring = [...defs.values()].find((d) => d.attributes.expireTime === "01:01:2011");
  assert.equal(isAllowedInShop(expiring, Date.UTC(2010, 5, 1)), true);
  assert.equal(isAllowedInShop(expiring, NOW), false);
});

test("every tab lists items in rules order and pages hold 8 boxes", () => {
  for (const tab of SHOP_TABS.slice(0, 3)) {
    const list = shopItems(defs, tab.kind, NOW);
    assert.ok(list.length > 0, tab.sku);
    assert.ok(list.every((d) => d.kind === tab.kind));
  }
  assert.equal(shopItems(defs, "house", NOW)[0].sku, "houses_001_001");
  assert.deepEqual(boxPosition(0), [-190.3, -105]);
  assert.deepEqual(boxPosition(5), [-190.3 + 135, -105 + 190.1]);
  assert.deepEqual(boxPosition(8), boxPosition(0));
});

test("every item with exported art has a shop icon in the icon atlas (ItemDefinition.getIcon falls back to the normal art)", () => {
  const m = JSON.parse(readFileSync(new URL("../public/assets/manifest.json", import.meta.url)));
  const names = new Set();
  for (const img of m.shop_icon_atlas.images) assert.ok(img.startsWith("shop_icons_"));
  for (const t of JSON.parse(readFileSync(new URL("../public/assets/" + m.shop_icon_atlas.json, import.meta.url))).textures) for (const f of t.frames) names.add(f.filename);
  const ok = Object.entries(m.items).filter(([, it]) => it.status === "ok");
  assert.equal(ok.length, 385);
  for (const [sku, it] of ok) assert.ok(it.icon && names.has(it.icon), `icon for ${sku}`);
});
