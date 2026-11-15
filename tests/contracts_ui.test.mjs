import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convertNumberToString, convertTimeToString } from "../public/js/game/textFormat.js";
import { parseContractViews, parseRules } from "../public/js/game/economy.js";
import { shopPriceLabel } from "../public/js/game/shop.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const units = { day: "Day", days: "Days", hour: "Hour", hours: "Hours", minutes: "Mins", seconds: "Secs" };
const H = 3_600_000;

test("convertNumberToString: TRUNCATE_THOUSAND and TRUNCATE_MILLIONS", () => {
  assert.equal(convertNumberToString(90, "thousand", 6), "90");
  assert.equal(convertNumberToString(1062, "thousand", 6), "1,062");
  assert.equal(convertNumberToString(150000, "thousand", 6), "150,000");
  assert.equal(convertNumberToString(150000, "thousand", 4), "150K");
  // After dividing by 1000, values of 1000 or more are divided again and shown in millions.
  assert.equal(convertNumberToString(1500000, "thousand", 6), "1.50M");
  assert.equal(convertNumberToString(2500000, "thousand", 4), "2.50M");
  assert.equal(convertNumberToString(12000000, "millions", 7), "12M");
  assert.equal(convertNumberToString(0, "thousand", 6), "0");
  assert.equal(shopPriceLabel(4000000), "4,000,000");
  assert.equal(shopPriceLabel(12500000), "13M", "10 or more: no decimals");
  assert.equal(shopPriceLabel(12500000 / 5), "2,500,000");
  assert.equal(convertNumberToString(2500000, "millions", 6), "2.50M");
});

test("convertTimeToString(ms, true) for the contract durations in contracts.xml", () => {
  const t = (h) => convertTimeToString(h * H, units);
  assert.equal(t(0.05), "3 Mins");
  assert.equal(t(0.5), "30 Mins");
  assert.equal(t(1), "1 Hour");
  assert.equal(t(1.5), "1 Hour 30 Mins");
  assert.equal(t(12), "12 Hours");
  assert.equal(t(24), "1 Day");
  assert.equal(t(72), "3 Days");
  assert.equal(convertTimeToString(45_000, units), "45 Secs");
  assert.equal(convertTimeToString(90_500, units), "1 Mins 31 Secs");
});

test("contract names use TID_CONTRACT<n> in contractsNames.xml order; level and icon come from contracts.xml", () => {
  const views = parseContractViews(read("rules/contracts.json"), read("rules/contractsNames.json"));
  const locale = read("locale/en.json");
  const contracts = read("rules/contracts.json")._children;
  for (const c of contracts) {
    const v = views.get(String(c.sku));
    assert.ok(locale[v.tid] && locale[v.tid] !== "placeholder", `contract ${c.sku} has a text`);
    assert.equal(v.level, Number(c.level));
    assert.equal(v.icon, c.icon);
  }
  assert.equal(views.get("6").level, 4, "Pilots need level 4");
  assert.deepEqual(["1", "2", "3"].map((s) => locale[views.get(s).tid]), ["Family", "Students", "Tourists"]);
  assert.equal(locale[views.get("300").tid], "Short Term", "name sku Season Short");
});

test("contract box: six slots per page on the original grid", async () => {
  const { slotPosition, pageCount, ITEMS_PER_PAGE } = await import("../public/js/ui/ContractBox.js");
  assert.equal(ITEMS_PER_PAGE, 6);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(slotPosition), [[-114, -80], [0, -80], [114, -80], [-114, 67], [0, 67], [114, 67]]);
  assert.deepEqual(slotPosition(7), slotPosition(1));
  assert.equal(pageCount(9), 2);
  assert.equal(pageCount(6), 1);
  assert.equal(pageCount(0), 1);
  const rules = parseRules(read("rules/contracts.json"), read("rules/contractsTypes.json"), read("rules/settings.json"));
  assert.ok([...rules.contractsByType.values()].some((l) => l.length > ITEMS_PER_PAGE), "some house types need a second page");
});

test("shop info boxes: texts of ShopMenuInfoHouse, ShopMenuInfoCommerce and ShopMenuInfoDeco", async () => {
  const { shopInfoSymbol, shopInfoTexts } = await import("../public/js/ui/shopInfo.js");
  const { buildDefinitions, definitionFiles } = await import("../public/js/game/definitions.js");
  const defs = buildDefinitions(Object.fromEntries(definitionFiles().map((f) => [f, read("rules/" + f)])));
  const locale = read("locale/en.json");
  const t = (tid, fb) => locale[tid] ?? fb;
  const house = defs.get("houses_001_001");
  const h = shopInfoTexts(house, t);
  assert.equal(shopInfoSymbol(house), "popup_info_box_");
  assert.equal(h.plots, `${house.baseCols}x${house.baseRows}`);
  assert.equal(h.Size, "Plot Size:");
  assert.equal(h.Time_Number, convertTimeToString(Number(house.attributes.constructionTime) * 60_000, units, true));
  const pizza = defs.get("commerce_pizza");
  const c = shopInfoTexts(pizza, t);
  assert.equal(shopInfoSymbol(pizza), "popup_info_box_commerce_");
  assert.equal(c.Influence, "7x7", "3x3 base plus influenceRatio 2 on each side");
  assert.equal(c.Income_Number, "$40");
  const deco = [...defs.values()].find((d) => d.kind === "decoration" && Number(d.attributes.influenceValue) > 0);
  assert.equal(shopInfoTexts(deco, t).Income_Bonus_Number, `+${deco.attributes.influenceValue}%`);
  const statue = defs.get("wonder_statue_of_money");
  assert.equal(shopInfoSymbol(statue), "popup_info_box_wonder_");
  assert.equal(shopInfoTexts(statue, t).Text, "This Wonder increases Income Bonus by 5% on all Houses you own.");
  assert.equal(shopInfoTexts(defs.get("wonder_eiffel_tower"), t).Text, "This Wonder increases Commerces Income by 2%.");
  assert.match(shopInfoTexts(defs.get("wonder_clock_tower"), t).Text, /^This clock is a wonder!.* 1% probability/);
  assert.equal(shopInfoTexts(defs.get("wonder_npc_Ronald"), t).Text, "This Wonder increases Daily Bonus by 5000 Dollars.");
  assert.equal(shopInfoTexts(statue, t).Time_Number, convertTimeToString(20160 * 60_000, units), "14 days, no hours");
  const layouts = read("ui_layout.json");
  for (const k of ["", "commerce_", "decoration_", "wonder_"]) for (const side of ["left", "right"]) assert.ok(layouts[`popup_info_box_${k}${side}`]);
  assert.deepEqual(layouts.popup_confirm.text_fields.map((f) => f.path).sort(), ["text", "title"], "PopupConfirm fields");
  assert.ok(layouts.popup_confirm.layers.button_close && layouts.popup_confirm.layers["button_close@2"]);
});

test("convertTimeToString with days and hours (ShopMenuInfoHouse build time)", () => {
  assert.equal(convertTimeToString(30 * H, units, true), "1 Day 6 Hours");
  assert.equal(convertTimeToString(25 * H, units, true), "1 Day 1 Hour");
  assert.equal(convertTimeToString(48 * H, units, true), "2 Days");
  assert.equal(convertTimeToString(30 * H, units), "1 Day");
});
