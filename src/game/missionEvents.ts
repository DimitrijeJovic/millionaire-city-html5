import { ItemDefinition } from "./definitions.js";

// ItemDefinition.NAME_TYPES, indexed by item type.
const NAME_TYPES: Partial<Record<ItemDefinition["kind"], string>> = {
  house: "Houses", commerce: "Commerces", decoration: "Decorations", wonder: "Wonders",
};

export type MissionEvent = [type: string, parameter: string];

// ItemObject.registerEvent: <type>+nameType, <type>+nameType_subtype for each subtype, <type>+sku.
export function itemEvents(type: string, def: ItemDefinition): MissionEvent[] {
  const nameType = NAME_TYPES[def.kind];
  const out: MissionEvent[] = [];
  if (nameType) {
    out.push([type, nameType]);
    for (const sub of (def.attributes.subtype ?? "").split(",").filter(Boolean)) out.push([type, `${nameType}_${sub}`]);
  }
  out.push([type, def.sku]);
  return out;
}

// StateOnRent.onIncome: houses add nameType%<contract time sku>; both register nameType and sku.
export function collectEvents(def: ItemDefinition, contractIncomeTime: string | null): MissionEvent[] {
  const nameType = NAME_TYPES[def.kind] ?? "";
  const out: MissionEvent[] = [];
  if (def.kind === "house" && contractIncomeTime !== null) out.push(["collect", `${nameType}%${contractIncomeTime}`]);
  out.push(["collect", nameType], ["collect", def.sku]);
  return out;
}

// Bonus missions name a house sku or its family prefix ("houses_001").
export function bonusParameters(sku: string): string[] {
  const parts = sku.split("_");
  return parts.length >= 3 ? [sku, parts.slice(0, 2).join("_")] : [sku];
}
