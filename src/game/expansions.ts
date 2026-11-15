import { AREA_COLS, AREA_ROWS, AREAS_PER_SIDE, TILE } from "./geometry.js";

// Plot types (Plot.<cinit>).
export const PlotType = { Locked: 0, Normal: 1, Full: 2 } as const;

export interface ExpansionRule {
  index: number;
  unlockOrder: number;
  areas: number[];
}

export interface ExpansionPrice {
  coins: number;
  cash: number;
  friendsNeeded: number;
}

type Node = { _children?: Array<Record<string, unknown>> };

export function parseExpansions(expansions: Node, prices: Node): { rules: ExpansionRule[]; prices: ExpansionPrice[] } {
  const rules = (expansions._children ?? []).map((n, index) => ({
    index, unlockOrder: Number(n.unlockedOrder), areas: String(n.Composition).split(",").map(Number),
  }));
  // RulesFacade.expansionsPricesLoadOnComplete: DCCash and InversorsSuccessful are ints, DCCoins a Number.
  const p = (prices._children ?? []).map((n) => ({
    coins: Number(n.DCCoins), cash: Math.trunc(Number(n.DCCash)), friendsNeeded: Math.trunc(Number(n.InversorsSuccessful ?? 0)),
  }));
  return { rules, prices: p };
}

// A plot's rectangle in world pixels: the bounding box of its areas (RulesFacade.expansionsGetPlotX/Y/Width/Height).
export function plotRect(rule: ExpansionRule): { x: number; y: number; w: number; h: number } {
  const cols = rule.areas.map((a) => a % AREAS_PER_SIDE);
  const rows = rule.areas.map((a) => Math.floor(a / AREAS_PER_SIDE));
  const x0 = Math.min(...cols), x1 = Math.max(...cols) + 1, y0 = Math.min(...rows), y1 = Math.max(...rows) + 1;
  return { x: x0 * AREA_COLS * TILE, y: y0 * AREA_ROWS * TILE, w: (x1 - x0) * AREA_COLS * TILE, h: (y1 - y0) * AREA_ROWS * TILE };
}

// Plot states consistent with owned areas: owned plots are full; the next unlock order opens once every
// plot of the previous order is full (Map.buyPlot).
export function plotsFromAreas(rules: ExpansionRule[], areas: number[]): number[] {
  const owned = new Set(areas);
  const plots: number[] = rules.map((r) => (r.areas.every((a) => owned.has(a)) ? PlotType.Full : PlotType.Locked));
  const orders = [...new Set(rules.map((r) => r.unlockOrder))].sort((a, b) => a - b);
  for (const order of orders) {
    const ofOrder = rules.filter((r) => r.unlockOrder === order);
    for (const r of ofOrder) if (plots[r.index] !== PlotType.Full) plots[r.index] = PlotType.Normal;
    if (!ofOrder.every((r) => plots[r.index] === PlotType.Full)) break;
  }
  return plots;
}

// Profile.set plots: mExpansionsMineCount starts at -1 and counts full plots, so the starting plot is free.
export function expansionPrice(prices: ExpansionPrice[], plots: number[]): ExpansionPrice | null {
  const index = plots.filter((p) => p === PlotType.Full).length - 1;
  return prices[index] ?? null;
}

// Map.buyPlot: mark the plot full; when its unlock order is complete, open the plots of the next order.
export function buyPlot(rules: ExpansionRule[], plots: number[], index: number): number[] {
  const next = [...plots];
  next[index] = PlotType.Full;
  const order = rules[index].unlockOrder;
  if (rules.filter((r) => r.unlockOrder === order).every((r) => next[r.index] === PlotType.Full)) {
    for (const r of rules) if (r.unlockOrder === order + 1 && next[r.index] === PlotType.Locked) next[r.index] = PlotType.Normal;
  }
  return next;
}

// rules/universe/map.xml LogicTiles: "type:x:y" relative to the map centre; type 0 is LogicTileSolid.
export function parseSolidTiles(root: Node): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const n of root._children ?? []) {
    for (const part of String(n.chunk ?? "").split(",")) {
      const [type, x, y] = part.split(":").map(Number);
      if (type === 0 && Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
    }
  }
  return out;
}
