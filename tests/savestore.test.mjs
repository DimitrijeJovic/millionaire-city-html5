import { test } from "node:test";
import assert from "node:assert/strict";
import { importCity } from "../public/js/game/gameState.js";
import { LocalSaveStore } from "../public/js/services/SaveStore.js";

class MemoryStorage {
  m = new Map();
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
}
const file = { format: "mcity-html5-city/1", profile: { DCCoins: "100", DCCash: "0", exp: "0", cityname: "T", companyValue: "0" },
  hqLevel: 0, items: [], roads: [], terrain: [] };

test("a corrupt current save falls back to the backup and never overwrites it", () => {
  const st = new MemoryStorage();
  const store = new LocalSaveStore("k", st);
  const good = importCity(file, 0);
  store.save(good);
  good.profile.coins = 200;
  store.save(good);
  st.setItem("k", "{not json");
  const loaded = store.load();
  assert.equal(loaded.profile.coins, 100, "backup copy");
  loaded.profile.coins = 150;
  store.save(loaded);
  assert.equal(JSON.parse(st.getItem("k.prev")).profile.coins, 100, "the corrupt entry did not replace the backup");
  assert.equal(store.load().profile.coins, 150);
});

test("an invalid document (wrong version, missing fields) is rejected and the backup is used", () => {
  const st = new MemoryStorage();
  const store = new LocalSaveStore("k", st);
  store.save(importCity(file, 0));
  store.save(importCity(file, 0));
  st.setItem("k", JSON.stringify({ version: 99, profile: { coins: 1 } }));
  assert.equal(store.load().profile.coins, 100);
  st.setItem("k.prev", "garbage");
  assert.equal(store.load(), null, "nothing valid left: the caller imports the city again");
});
