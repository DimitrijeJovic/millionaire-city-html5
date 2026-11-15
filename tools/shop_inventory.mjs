// Shop inventory: every item definition, its shop category, whether its art was exported and why it is or is not
// offered. Usage: tools\runtime\node.exe tools\shop_inventory.mjs <out_dir>   (after the TypeScript build)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildDefinitions, definitionFiles } from "../public/js/game/definitions.js";
import { isAllowedInShop, parseRulesDate } from "../public/js/game/shop.js";

const root = new URL("../public/assets/", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const out = process.argv[2] ?? ".";
mkdirSync(out, { recursive: true });
const defs = buildDefinitions(Object.fromEntries(definitionFiles().map((f) => [f, read("rules/" + f)])));
const manifest = read("manifest.json");
const tabs = read("rules/gui__shopTabDefinitions.json")._children.map((t) => t.sku);
const now = Date.now();

function reason(d) {
  const a = d.attributes;
  if (d.kind === "headquarters" || d.kind === "other") return "not a shop kind";
  if (a.where !== undefined && !a.where.split(",").includes("shop")) return `where=${a.where}`;
  if (a.freeGift === "1") return "free gift";
  if (d.sku.startsWith("wonder_npc_")) return "NPC wonder";
  const release = parseRulesDate(a.releaseTime);
  if (release !== null && now < release) return "not released";
  const expire = parseRulesDate(a.expireTime);
  if (expire !== null && now >= expire) return `expired ${a.expireTime}`;
  return null;
}

const rows = [...defs.values()].map((d) => {
  const art = manifest.items[d.sku]?.status ?? "no entry";
  const r = reason(d);
  return { sku: d.sku, kind: d.kind, shopTab: d.attributes.shopTab ?? "", featured: d.attributes.featured === "1", art,
    offered: isAllowedInShop(d, now) && art === "ok", notOffered: r ?? (art !== "ok" ? `art: ${art}` : null) };
});
const kinds = {};
for (const r of rows) {
  const k = (kinds[r.kind] ??= { total: 0, offered: 0, withArt: 0, reasons: {} });
  k.total++;
  if (r.offered) k.offered++;
  if (r.art === "ok") k.withArt++;
  if (!r.offered) k.reasons[r.notOffered] = (k.reasons[r.notOffered] ?? 0) + 1;
}
const byTab = {};
for (const r of rows) if (r.shopTab) byTab[r.shopTab] = (byTab[r.shopTab] ?? 0) + 1;
const summary = { date: new Date(now).toISOString(), tabs, kinds, shopTabAttribute: byTab, featured: rows.filter((r) => r.featured).length };
writeFileSync(`${out}/shop_inventory.json`, JSON.stringify({ summary, rows }, null, 1));
const lines = ["sku\tkind\tshopTab\tfeatured\tart\toffered\treason"];
for (const r of rows) lines.push([r.sku, r.kind, r.shopTab, r.featured ? 1 : 0, r.art, r.offered ? 1 : 0, r.notOffered ?? ""].join("\t"));
writeFileSync(`${out}/shop_inventory.tsv`, lines.join("\n") + "\n");
console.log(JSON.stringify(summary, null, 1));
