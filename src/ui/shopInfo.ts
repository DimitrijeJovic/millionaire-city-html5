import { ItemDefinition } from "../game/definitions.js";
import { TextLookup, convertNumberToString, convertTimeToString, localeTimeUnits } from "../game/textFormat.js";

// hud.swf symbol per item kind (ItemContentUnlocked.showInfoBox). Clubs have popup_info_box_club_*, but the only
// club definition belongs to an A/B group that is not loaded, so no club reaches the shop.
export function shopInfoSymbol(def: ItemDefinition): string | null {
  return def.kind === "house" ? "popup_info_box_" : def.kind === "commerce" ? "popup_info_box_commerce_"
    : def.kind === "decoration" ? "popup_info_box_decoration_" : def.kind === "wonder" ? "popup_info_box_wonder_" : null;
}

// ShopMenuInfoWonder: WonderTypeDefinition.getTidDescription(target) with the income value; the clock tower has its
// own text. The key per wonder type and target is matched by name in the locale (INFLUENCE_HOUSES, ...), because
// the tid counter of the type definitions is not stored in the rules.
const WONDER_TIDS: Record<string, string> = {
  "influence:Houses": "TID_WONDER_TYPE_INFLUENCE_HOUSES_INFO",
  "influence:Commerces": "TID_WONDER_TYPE_INFLUENCE_COMMERCE_INFO",
  "incomeMultiplier:Houses": "TID_WONDER_TYPE_MULTIPLIER_INFO",
  npcIncome: "TID_WONDER_TYPE_NPC_INCOME_INFO",
};

export function wonderDescriptionTid(def: ItemDefinition): string | null {
  if (def.sku === "wonder_clock_tower") return "TID_WONDER_TYPE_MULTIPLIER_CLOCK_INFO";
  const a = def.attributes;
  return WONDER_TIDS[`${a.subtype}:${a.target}`] ?? WONDER_TIDS[a.subtype ?? ""] ?? null;
}

// ShopMenuInfoHouse / ShopMenuInfoCommerce / ShopMenuInfoDeco.setUpBox: field name -> text.
export function shopInfoTexts(def: ItemDefinition, t: TextLookup): Record<string, string> {
  const a = def.attributes;
  const ratio = Math.trunc(Number(a.influenceRatio ?? 0) * 2);
  const out: Record<string, string> = {
    TopText: t(def.tid, def.name),
    Size: t("TID_INFO_SIZE", "Plot Size:"),
    plots: `${def.baseCols}x${def.baseRows}`,
  };
  if (def.kind === "wonder") {
    out.Time = t("TID_SHOP_BUILD_TIME", "Build Time:");
    out.Time_Number = convertTimeToString(Number(a.constructionTime ?? 0) * 60_000, localeTimeUnits(t));
    const tid = wonderDescriptionTid(def);
    if (tid) out.Text = t(tid, "").replace("%U", String(a.incomeValue ?? ""));
  }
  if (def.kind === "house") {
    out.Time = t("TID_SHOP_BUILD_TIME", "Build Time:");
    out.Time_Number = convertTimeToString(Number(a.constructionTime ?? 0) * 60_000, localeTimeUnits(t), true);
  }
  if (def.kind === "commerce" || def.kind === "decoration") {
    out.Influence_name = t("TID_SHOPE_INFO_INFLUENCE", "Influence:");
    // ItemDefinition.getInfluenceSideX/Y: the base plus influenceRatio * 2.
    out.Influence = `${def.baseCols + ratio}x${def.baseRows + ratio}`;
  }
  if (def.kind === "commerce") {
    out.Income_Bonus = t("TID_SHOP_RENT", "Income");
    out.Income_Number = t("TID_COIN_SYMBOL", "$") + convertNumberToString(Number(a.incomeValue ?? 0), "thousand", 6);
  }
  if (def.kind === "decoration") {
    out.Income_Bonus = t("TID_DECORATION_INFO_HOUSES_BONUS", "Houses Bonus:");
    out.Income_Bonus_Number = t("TID_GEN_PERCENTAGE", "%U%").replace("%U", "+" + convertNumberToString(Number(a.influenceValue ?? 0), null, 0));
  }
  return out;
}
