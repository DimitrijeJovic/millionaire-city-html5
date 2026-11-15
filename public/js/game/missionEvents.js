// ItemDefinition.NAME_TYPES, indexed by item type.
const NAME_TYPES = {
    house: "Houses", commerce: "Commerces", decoration: "Decorations", wonder: "Wonders",
};
// ItemObject.registerEvent: <type>+nameType, <type>+nameType_subtype for each subtype, <type>+sku.
export function itemEvents(type, def) {
    const nameType = NAME_TYPES[def.kind];
    const out = [];
    if (nameType) {
        out.push([type, nameType]);
        for (const sub of (def.attributes.subtype ?? "").split(",").filter(Boolean))
            out.push([type, `${nameType}_${sub}`]);
    }
    out.push([type, def.sku]);
    return out;
}
// StateOnRent.onIncome: houses add nameType%<contract time sku>; both register nameType and sku.
export function collectEvents(def, contractIncomeTime) {
    const nameType = NAME_TYPES[def.kind] ?? "";
    const out = [];
    if (def.kind === "house" && contractIncomeTime !== null)
        out.push(["collect", `${nameType}%${contractIncomeTime}`]);
    out.push(["collect", nameType], ["collect", def.sku]);
    return out;
}
// Bonus missions name a house sku or its family prefix ("houses_001").
export function bonusParameters(sku) {
    const parts = sku.split("_");
    return parts.length >= 3 ? [sku, parts.slice(0, 2).join("_")] : [sku];
}
//# sourceMappingURL=missionEvents.js.map