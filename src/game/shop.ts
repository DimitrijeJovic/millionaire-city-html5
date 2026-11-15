import { ItemDefinition, ItemKind } from "./definitions.js";
import { convertNumberToString } from "./textFormat.js";

// rules/gui/shopTabDefinitions.xml tabs shown in the shop symbol, with the item type each lists.
export const SHOP_TABS: ReadonlyArray<{ sku: string; tid: string; kind: ItemKind }> = [
  { sku: "Houses", tid: "TID_BUTTON_HOUSES", kind: "house" },
  { sku: "Commerces", tid: "TID_BUTTON_COMMERCES", kind: "commerce" },
  { sku: "Decorations", tid: "TID_BUTTON_DECORATIONS", kind: "decoration" },
  { sku: "Wonders", tid: "TID_BUTTON_WONDERS", kind: "wonder" },
];

// BuyBox: 8 boxes per page in 4 columns and 2 rows.
export const ITEMS_PER_PAGE = 8;
export const BOX_X0 = -190.3;
export const BOX_DX = 135;
export const BOX_Y0 = -105;
export const BOX_DY = 190.1;

export function boxPosition(index: number): [number, number] {
  const inPage = index % ITEMS_PER_PAGE;
  return [BOX_X0 + BOX_DX * (inPage % 4), BOX_Y0 + BOX_DY * Math.floor(inPage / 4)];
}

// Rules dates are "dd:mm:yyyy" with an optional ":hh:mm:ss".
export function parseRulesDate(value: string | undefined): number | null {
  if (!value) return null;
  const p = value.split(":").map(Number);
  if (p.length < 3 || p.some((n) => !Number.isFinite(n))) return null;
  return Date.UTC(p[2], p[1] - 1, p[0], p[3] ?? 0, p[4] ?? 0, p[5] ?? 0);
}

// ItemDefinition.isAllowedToBeInShop for the attributes present in the rules files.
export function isAllowedInShop(def: ItemDefinition, now: number): boolean {
  const a = def.attributes;
  if (def.kind === "headquarters" || def.kind === "other") return false;
  if (a.where !== undefined && !a.where.split(",").includes("shop")) return false;
  if (a.freeGift === "1") return false;
  if (def.sku.startsWith("wonder_npc_")) return false;
  const release = parseRulesDate(a.releaseTime);
  if (release !== null && now < release) return false;
  const expire = parseRulesDate(a.expireTime);
  if (expire !== null && now >= expire) return false;
  return true;
}

// Why a definition is or is not in the shop. Limited-time items whose expireTime has passed are "expired": the
// original stopped offering them, but they are complete items with art, so the catalogue can still list them.
export type ShopAvailability = "available" | "expired" | "hidden";

export function shopAvailability(def: ItemDefinition, now: number): ShopAvailability {
  if (isAllowedInShop(def, now)) return "available";
  const expire = parseRulesDate(def.attributes.expireTime);
  if (expire === null || now < expire) return "hidden";
  // Expired, and otherwise a normal shop item.
  return isAllowedInShop(def, expire - 1) ? "expired" : "hidden";
}

export function shopItems(defs: Map<string, ItemDefinition>, kind: ItemKind, now: number): ItemDefinition[] {
  return [...defs.values()].filter((d) => d.kind === kind && isAllowedInShop(d, now));
}

// TextManager.convertNumberToString(value, TRUNCATE_MILLIONS, 7) as used for shop prices.
export function shopPriceLabel(value: number): string {
  return convertNumberToString(value, "millions", 7);
}

// shopTabDefinitions: "featured" (Specials) lists definitions with featured="1"; "new_items" (Skyscraper Week) lists
// those with shopTab="new_items". Availability follows isAllowedInShop like every other tab; an expired item stays
// visible in its tab but cannot be bought (all new_items expired on 16.01.2012).
export type SpecialTab = "featured" | "new_items";

export function specialTabItems(defs: Map<string, ItemDefinition>, tab: SpecialTab): ItemDefinition[] {
  return [...defs.values()].filter((d) => (tab === "featured" ? d.attributes.featured === "1" : d.attributes.shopTab === "new_items"));
}
