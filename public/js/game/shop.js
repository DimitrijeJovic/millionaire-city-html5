import { convertNumberToString } from "./textFormat.js";
// rules/gui/shopTabDefinitions.xml tabs shown in the shop symbol, with the item type each lists.
export const SHOP_TABS = [
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
export function boxPosition(index) {
    const inPage = index % ITEMS_PER_PAGE;
    return [BOX_X0 + BOX_DX * (inPage % 4), BOX_Y0 + BOX_DY * Math.floor(inPage / 4)];
}
// Rules dates are "dd:mm:yyyy" with an optional ":hh:mm:ss".
export function parseRulesDate(value) {
    if (!value)
        return null;
    const p = value.split(":").map(Number);
    if (p.length < 3 || p.some((n) => !Number.isFinite(n)))
        return null;
    return Date.UTC(p[2], p[1] - 1, p[0], p[3] ?? 0, p[4] ?? 0, p[5] ?? 0);
}
// ItemDefinition.isAllowedToBeInShop for the attributes present in the rules files.
export function isAllowedInShop(def, now) {
    const a = def.attributes;
    if (def.kind === "headquarters" || def.kind === "other")
        return false;
    if (a.where !== undefined && !a.where.split(",").includes("shop"))
        return false;
    if (a.freeGift === "1")
        return false;
    if (def.sku.startsWith("wonder_npc_"))
        return false;
    const release = parseRulesDate(a.releaseTime);
    if (release !== null && now < release)
        return false;
    const expire = parseRulesDate(a.expireTime);
    if (expire !== null && now >= expire)
        return false;
    return true;
}
export function shopAvailability(def, now) {
    if (isAllowedInShop(def, now))
        return "available";
    const expire = parseRulesDate(def.attributes.expireTime);
    if (expire === null || now < expire)
        return "hidden";
    // Expired, and otherwise a normal shop item.
    return isAllowedInShop(def, expire - 1) ? "expired" : "hidden";
}
export function shopItems(defs, kind, now) {
    return [...defs.values()].filter((d) => d.kind === kind && isAllowedInShop(d, now));
}
// TextManager.convertNumberToString(value, TRUNCATE_MILLIONS, 7) as used for shop prices.
export function shopPriceLabel(value) {
    return convertNumberToString(value, "millions", 7);
}
export function specialTabItems(defs, tab) {
    return [...defs.values()].filter((d) => (tab === "featured" ? d.attributes.featured === "1" : d.attributes.shopTab === "new_items"));
}
//# sourceMappingURL=shop.js.map