import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefinitions } from "../public/js/game/definitions.js";
import { parseRules, Mode } from "../public/js/game/economy.js";
import { CONTRACT_CANCEL_TIME_MS, GameState, importCity } from "../public/js/game/gameState.js";
import { Builder, parseLevels } from "../public/js/game/construction.js";
import { relativeToTile } from "../public/js/game/geometry.js";
import { centreRange, clampCentre } from "../public/js/game/camera.js";
import { SERVICE_SKUS, emptyServices, parseServices, parseServicesData } from "../public/js/game/services.js";
import { edgeProfile } from "../public/js/scenes/mapSurround.js";
import { popupScale } from "../public/js/ui/Contractors.js";
import { shopBoxLayout } from "../public/js/ui/ShopPanel.js";
import { STORAGE_ITEMS_PER_PAGE, storageSlots } from "../public/js/ui/StoragePanel.js";

const read = (p) => JSON.parse(readFileSync(new URL("../public/assets/" + p, import.meta.url)));
const text = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const defs = buildDefinitions(Object.fromEntries(
  ["itemDefinitions.json", "commerceDefinitions.json", "decorationDefinitions.json", "wonderDefinitions.json"].map((f) => [f, read("rules/" + f)])));
const rules = parseRules(read("rules/contracts.json"), read("rules/contractsTypes.json"), read("rules/settings.json"));
const levels = parseLevels(read("rules/XPTable.json"));
const layouts = read("ui_layout.json");
const T = (rx, ry) => relativeToTile(rx, ry);
const plot = (rx, ry, w, h) => {
  const out = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) out.push([rx + x, ry + y]);
  return out;
};

function setup({ coins = 1_000_000, cash = 0, exp = 0, terrain = [], roads = [], items = [] } = {}) {
  const file = { format: "mcity-html5-city/1", profile: { DCCoins: String(coins), DCCash: String(cash), exp: String(exp), cityname: "T", companyValue: "0" },
    hqLevel: 0, items, roads, terrain };
  const game = new GameState(importCity(file, 0), defs, rules);
  return { game, b: new Builder(game, levels, { itemProfitPercentage: 35, terrainProfitPercentage: 100 }) };
}

// --- Cancel contract (StateOnRent.doDoClick / contractCancelOnAccept / CONTRACT_CANCEL_TIME) ---

function rentingHouse() {
  const { game, b } = setup({ terrain: plot(0, 0, 2, 2), items: [{ sid: 1, sku: "houses_001_001", x: 0, y: 0 }] });
  const sku = game.contractsFor(1)[0];
  game.item(1).state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: 0 };
  assert.ok(game.signContract(1, sku, 0));
  game.advance(5000);
  assert.equal(game.item(1).state.mode, Mode.Renting);
  return { game, b };
}

test("cancel contract: only a renting house; 3 s of MODE_CANCELING_CONTRACT, then waiting for a contract", () => {
  assert.equal(CONTRACT_CANCEL_TIME_MS, 3000);
  const { game } = rentingHouse();
  const coins = game.data.profile.coins;
  assert.ok(game.canCancelContract(1));
  assert.ok(game.cancelContract(1, 10_000));
  assert.equal(game.item(1).state.mode, Mode.CancelingContract);
  assert.equal(game.cancelContract(1, 10_001), false, "a second cancel is refused");
  game.advance(12_999);
  assert.equal(game.item(1).state.mode, Mode.CancelingContract);
  assert.deepEqual(game.advance(13_000), [1]);
  assert.equal(game.item(1).state.mode, Mode.WaitingForContract);
  assert.equal(game.item(1).state.contractSku, undefined, "the contract is gone");
  assert.equal(game.data.profile.coins, coins, "nothing is refunded or paid");
  assert.equal(game.collect(1, 20_000), null, "no rent after a cancel");
});

test("cancel contract: houses waiting, signing or with rent to collect cannot be cancelled; it survives a save", () => {
  const { game } = setup({ items: [{ sid: 1, sku: "houses_001_001", x: 0, y: 0 }, { sid: 2, sku: "commerce_pizza", x: 4, y: 0 }] });
  game.item(1).state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: 0 };
  assert.equal(game.canCancelContract(1), false);
  game.item(1).state = { mode: Mode.GetRent, timeMs: 1000, savedAt: 0 };
  assert.equal(game.canCancelContract(1), false);
  assert.equal(game.canCancelContract(2), false, "commerces have no contract to cancel");
  const r = rentingHouse();
  r.game.cancelContract(1, 10_000);
  const copy = new GameState(JSON.parse(JSON.stringify(r.game.snapshot())), defs, rules);
  copy.advance(20_000);
  assert.equal(copy.item(1).state.mode, Mode.WaitingForContract);
});

// --- Move (ToolMove, PopupConfirmMove, PopupPayMove) ---

test("move: movable states follow doIsMoveable; the headquarters never moves", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 8, 8), items: [
    { sid: 1, sku: "houses_001_001", x: 0, y: 0 }, { sid: 2, sku: "decorations_tree_01", x: 6, y: 6 }, { sid: 3, sku: "HeadQuarter", x: 10, y: 10 }] });
  for (const [mode, ok] of [[Mode.WaitingForContract, true], [Mode.Renting, true], [Mode.Abandoned, true], [Mode.GetRent, false], [Mode.SigningContract, false]]) {
    game.item(1).state = { mode, timeMs: 1000, savedAt: 0 };
    assert.equal(b.isMovable(1), ok, "mode " + mode);
  }
  assert.equal(b.isMovable(2), true);
  assert.equal(b.isMovable(3), false);
  game.item(2).construction = { timeMs: 5000, savedAt: 0 };
  assert.equal(b.isMovable(2), true, "under construction");
  game.item(2).construction = { timeMs: 0, savedAt: 0 };
  assert.equal(b.isMovable(2), false, "finished construction waiting for its click");
});

test("move: same position, occupied, roads and missing plots are refused; the item's own tiles count as free", () => {
  const { game, b } = setup({ terrain: plot(0, 0, 6, 2), roads: [[0, 3]], items: [{ sid: 1, sku: "houses_001_001", x: 0, y: 0 }, { sid: 2, sku: "houses_001_001", x: 4, y: 0 }] });
  game.item(1).state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: 0 };
  const at = T(0, 0);
  assert.equal(b.canMove(1, at.x, at.y), "same");
  assert.equal(b.canMove(1, T(4, 0).x, T(4, 0).y), "occupied");
  assert.equal(b.canMove(1, T(0, 3).x, T(0, 3).y), "occupied", "road");
  assert.equal(b.canMove(1, T(0, 6).x, T(0, 6).y), "needs_terrain");
  assert.equal(b.canMove(1, T(1, 0).x, T(1, 0).y), null, "overlapping its own old tiles");
  assert.equal(b.canMove(1, T(2, 0).x, T(2, 0).y), null);
});

test("move: price = movePriceCoins + timePrice x construction minutes x min(instantBuildFactor, 1); state and sid kept", () => {
  const { game, b } = setup({ coins: 10_000_000, exp: 0, terrain: plot(0, 0, 8, 2), items: [{ sid: 7, sku: "houses_001_001", x: 0, y: 0 }] });
  const def = defs.get("houses_001_001").attributes;
  const expected = Math.trunc(Number(def.movePriceCoins ?? 0)) + Math.floor(levels[0].timePrice * Number(def.constructionTime ?? 0) * Math.min(Number(def.instantBuildFactor ?? 0), 1));
  assert.ok(levels[0].timePrice > 0, "XPTable timePrice");
  assert.deepEqual(b.movePrice(7), { coins: expected, cash: 0 });
  game.item(7).state = { mode: Mode.Renting, timeMs: 1234, savedAt: 0, contractSku: "x", cycle: "c" };
  const before = { ...game.item(7).state };
  const coins = game.data.profile.coins;
  assert.equal(b.move(7, T(4, 0).x, T(4, 0).y, false), null);
  assert.equal(game.data.profile.coins, coins - expected);
  assert.deepEqual(relativeToTile(game.item(7).x, game.item(7).y), T(4, 0));
  assert.deepEqual(game.item(7).state, before);
  assert.equal(game.data.items.length, 1, "no copy left behind");
  assert.equal(b.move(7, T(0, 0).x, T(0, 0).y, true), null, "free with the move service");
  assert.equal(game.data.profile.coins, coins - expected);
});

test("move: not enough dollars leaves the item and the money unchanged", () => {
  const { game, b } = setup({ coins: 0, terrain: plot(0, 0, 8, 2), items: [{ sid: 1, sku: "houses_001_001", x: 0, y: 0 }] });
  game.item(1).state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: 0 };
  if (b.movePrice(1).coins === 0) return;
  assert.equal(b.move(1, T(4, 0).x, T(4, 0).y, false), "coins");
  assert.deepEqual(relativeToTile(game.item(1).x, game.item(1).y), T(0, 0));
  assert.equal(game.data.profile.coins, 0);
});

test("move service: servicesDefinitions move = 24 h for 10 gold; stored next to the other contractors", () => {
  assert.deepEqual([...SERVICE_SKUS], ["moneyCollector", "contractSignator", "move"]);
  const offers = parseServices(read("rules/servicesDefinitions.json")).get("move");
  assert.equal(offers.length, 1);
  assert.equal(offers[0].hours, 24);
  assert.equal(offers[0].priceCash, 10);
  assert.deepEqual(emptyServices().move, { until: 0, waitUntil: {} });
  assert.equal(parseServicesData(JSON.stringify({ move: { until: 5 } })).move.until, 5);
  assert.equal(parseServicesData(JSON.stringify({ moneyCollector: { until: 9 } })).move.until, 0, "older saves without move");
});

// --- Camera: dragging when the map fits in the view ---

test("camera: a map larger than the view keeps the view inside it; a smaller map stays fully visible but can move", () => {
  assert.deepEqual(centreRange(1000, 2886), [500, 2386]);
  assert.equal(clampCentre(0, 1000, 2886), 500);
  assert.equal(clampCentre(5000, 1000, 2886), 2386);
  // 1904 px at zoom 0.25 = 7616 world px: the map (2886) may move between both edges of the view.
  const [lo, hi] = centreRange(7616, 2886);
  assert.equal(lo, 2886 - 3808);
  assert.equal(hi, 3808);
  assert.ok(hi - lo > 0, "there is room to drag");
  assert.equal(clampCentre(1443, 7616, 2886), 1443, "centred stays centred");
  assert.equal(clampCentre(99999, 7616, 2886), hi);
  assert.equal(clampCentre(1443, 2886, 2886), 1443, "exact fit: one position");
});

test("map surround: rows and columns of the edge band are averaged and smoothed", () => {
  const w = 4, h = 3;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([x === 0 ? 100 : 0, y * 10, 200, 255], (y * w + x) * 4);
  assert.deepEqual(edgeProfile(px, w, h, "left", 1, 0), [[100, 0, 200], [100, 10, 200], [100, 20, 200]]);
  assert.deepEqual(edgeProfile(px, w, h, "left", 2, 0)[1], [50, 10, 200]);
  assert.deepEqual(edgeProfile(px, w, h, "bottom", 1, 0).map((c) => c[1]), [20, 20, 20, 20]);
  assert.deepEqual(edgeProfile(px, w, h, "left", 1, 1)[0], [100, 5, 200], "moving average");
});

// --- UI: contractor popup size, Special Offer badge, shop cards, storage, desktop elements ---

test("contractor popup: enlarged up to 1.5x on large windows, original size on small ones, never outside the window", () => {
  const ext = [-330, -230, 330, 230];
  assert.equal(popupScale(ext, 2560, 1440), 1.5);
  const s1080 = popupScale(ext, 1920, 1080);
  assert.ok(s1080 > 1 && 230 * s1080 <= 540 - 150, String(s1080));
  assert.equal(popupScale(ext, 1264, 625), 1, "kept at the original size when only the HUD margin is missing");
  const tiny = popupScale(ext, 640, 400);
  assert.ok(tiny < 1 && 230 * tiny <= 200 - 8 && 330 * tiny <= 320 - 8, String(tiny));
});

test("Special Offer: the badge text keeps the original rotation (ItemService) through its matrix", () => {
  for (const name of ["popup_contract_box", "popup_collect_box_cash"]) {
    const f = layouts[name].text_fields.find((t) => t.path === "best/best");
    assert.ok(f.matrix && f.local_px, name);
    const deg = (Math.atan2(f.matrix[1], f.matrix[0]) * 180) / Math.PI;
    assert.ok(Math.abs(deg + 17.07) < 0.5, name + " rotated " + deg.toFixed(2));
  }
  const fields = Object.values(layouts).flatMap((l) => l.text_fields);
  assert.ok(fields.filter((f) => f.matrix).length <= 10, "only rotated fields carry a matrix");
});

test("shop cards: wonders use shop_box_wonder, every locked card shop_box_locked (ItemContent*.getBox)", () => {
  assert.equal(shopBoxLayout("wonder", false), "shop_box_wonder");
  assert.equal(shopBoxLayout("house", false), "shop_box");
  assert.equal(shopBoxLayout("commerce", false), "shop_box");
  assert.equal(shopBoxLayout("decoration", false), "shop_box");
  for (const k of ["house", "commerce", "decoration", "wonder"]) assert.equal(shopBoxLayout(k, true), "shop_box_locked");
  for (const name of ["shop_box", "shop_box_wonder", "shop_box_locked"]) assert.ok(layouts[name]?.bounds.image, name);
  assert.match(text("src/ui/ShopPanel.ts"), /if \(e\.locked\) holder\.style\.opacity = "0\.5"/, "ItemContentLocked.setupIcon alpha 0.5");
});

test("storage: PopupStorage layout, four boxes per page spread like setStorageItemPosition", () => {
  assert.equal(STORAGE_ITEMS_PER_PAGE, 4);
  for (const name of ["popup_storage", "storage_box"]) assert.ok(layouts[name], name);
  assert.ok(layouts.popup_storage.bounds.popup_area);
  assert.deepEqual(storageSlots(570, 220, 125, 185, 0), []);
  const one = storageSlots(570, 220, 125, 185, 1);
  assert.deepEqual(one, [[Math.ceil((570 - 125) / 2), 17.5]]);
  const four = storageSlots(570, 220, 125, 185, 9);
  assert.equal(four.length, 4);
  const gap = Math.ceil((570 - 500) / 5);
  assert.deepEqual(four.map((s) => s[0]), [gap, 125 + 2 * gap, 250 + 3 * gap, 375 + 4 * gap]);
});

test("original popups exported for phase 9 (expansion investments, move confirmation and payment)", () => {
  for (const name of ["box_invest_pending", "popup_confirm_buy_crane_operator", "popup_confirm_buy_rent_crane_operator"]) assert.ok(layouts[name], name);
  assert.ok(layouts.popup_confirm_buy_rent_crane_operator.layers.RentButton);
});

test("desktop page: no touch controls; the local profile button is labelled; the original loading page covers city switches", () => {
  const html = text("public/index.html");
  const css = text("public/css/game.css");
  const src = ["src/main.ts", "src/scenes/CityScene.ts", ...["BottomBar", "Toolbar", "Hud", "ProfilePanel"].map((n) => `src/ui/${n}.ts`)].map(text).join("\n");
  assert.doesNotMatch(html + css + src, /joystick|virtualStick|touchstart|addPointer\(/i);
  assert.doesNotMatch(src, /input\.addPointer|activePointers\s*:/);
  assert.match(text("src/ui/ProfilePanel.ts"), /textContent: "Local Profile"/);
  assert.doesNotMatch(css, /\.profile-toggle \{[^}]*border-radius: 50%/, "no unlabelled round button on the map");
  assert.match(html, /<div id="loading-screen"><img src="assets\/icons\/Background_loading\.png"/);
  const scene = text("src/scenes/CityScene.ts");
  assert.equal((scene.match(/location\.(assign|replace)\(/g) ?? []).length, 2, "only leaveCity navigates");
});
