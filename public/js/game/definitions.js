const SOURCES = [
    ["itemDefinitions.json", "house"],
    ["commerceDefinitions.json", "commerce"],
    ["decorationDefinitions.json", "decoration"],
    ["wonderDefinitions.json", "wonder"],
];
export function definitionFiles() {
    return SOURCES.map(([file]) => file);
}
function attributesOf(node) {
    const out = {};
    for (const [k, v] of Object.entries(node))
        if (typeof v === "string" && k !== "_tag")
            out[k] = v;
    return out;
}
export function buildDefinitions(files) {
    const defs = new Map();
    for (const [file, kind] of SOURCES) {
        const root = files[file];
        if (!root)
            continue;
        for (const node of root._children ?? []) {
            const a = attributesOf(node);
            if (!a.sku)
                continue;
            const resolvedKind = a.sku === "HeadQuarter" ? "headquarters" : kind === "house" && !a.sku.startsWith("houses") ? "other" : kind;
            defs.set(a.sku, {
                sku: a.sku,
                kind: resolvedKind,
                name: a.buildingsName ?? a.sku,
                tid: a.tid ?? "",
                baseRows: Number(a.baseRows ?? 1),
                baseCols: Number(a.baseCols ?? 1),
                isAnimated: a.isAnimated === "1",
                attributes: a,
            });
        }
    }
    return defs;
}
//# sourceMappingURL=definitions.js.map