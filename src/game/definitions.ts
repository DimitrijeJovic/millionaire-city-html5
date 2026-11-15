// Item definitions merged from the original rules files (attributes kept as provided by the XML).
export interface RulesNode {
  _tag: string;
  _children?: RulesNode[];
  [attribute: string]: string | RulesNode[] | undefined;
}

export type ItemKind = "house" | "commerce" | "decoration" | "headquarters" | "wonder" | "other";

export interface ItemDefinition {
  sku: string;
  kind: ItemKind;
  name: string;
  tid: string;
  baseRows: number;
  baseCols: number;
  isAnimated: boolean;
  attributes: Record<string, string>;
}

const SOURCES: Array<[string, ItemKind]> = [
  ["itemDefinitions.json", "house"],
  ["commerceDefinitions.json", "commerce"],
  ["decorationDefinitions.json", "decoration"],
  ["wonderDefinitions.json", "wonder"],
];

export function definitionFiles(): string[] {
  return SOURCES.map(([file]) => file);
}

function attributesOf(node: RulesNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(node)) if (typeof v === "string" && k !== "_tag") out[k] = v;
  return out;
}

export function buildDefinitions(files: Record<string, RulesNode>): Map<string, ItemDefinition> {
  const defs = new Map<string, ItemDefinition>();
  for (const [file, kind] of SOURCES) {
    const root = files[file];
    if (!root) continue;
    for (const node of root._children ?? []) {
      const a = attributesOf(node);
      if (!a.sku) continue;
      const resolvedKind: ItemKind = a.sku === "HeadQuarter" ? "headquarters" : kind === "house" && !a.sku.startsWith("houses") ? "other" : kind;
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
