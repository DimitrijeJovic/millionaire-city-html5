import { ItemDefinition, RulesNode } from "./definitions.js";

// StateOnRent modes (StateOnRent.<cinit>).
export const Mode = {
  None: 0, WaitingForContract: 1, SigningContract: 2, CancelingContract: 3, Renting: 4, GetRent: 5, GivingRent: 6, Abandoned: 7,
} as const;

export const CONTRACT_SIGN_TIME_MS = 3000;

export interface Contract {
  sku: string;
  costCoins: number;
  incomeCoins: number;
  incomeXp: number;
  incomeTimeMs: number;
}

export interface Settings {
  abandonMinTimeMs: number;
  abandonTimePercentage: number;
}

export interface Rules {
  contracts: Map<string, Contract>;
  contractsByType: Map<string, string[]>;
  settings: Settings;
}

export function parseRules(contracts: RulesNode, types: RulesNode, settings: RulesNode): Rules {
  const c = new Map<string, Contract>();
  // ContractDefinition stores cost, income and XP through EncryptionUtils.encryptCustom, whose bit
  // shifts turn them into 32-bit integers ("97.5" becomes 97).
  const int = (v: unknown) => Math.trunc(Number(v)) | 0;
  for (const n of contracts._children ?? []) {
    c.set(String(n.sku), {
      sku: String(n.sku), costCoins: int(n.costCoins), incomeCoins: int(n.incomeCoins), incomeXp: int(n.incomeXp),
      incomeTimeMs: Number(n.incomeTime) * 3_600_000,
    });
  }
  const t = new Map<string, string[]>();
  for (const n of types._children ?? []) t.set(String(n.sku), String(n.contractsSkus).split(",").filter(Boolean));
  const s = (settings._children ?? [])[0] ?? ({} as RulesNode);
  return {
    contracts: c, contractsByType: t,
    settings: { abandonMinTimeMs: Number(s.abandonMinTime ?? 60) * 60_000, abandonTimePercentage: Number(s.abandonTimePercentage ?? 100) },
  };
}

export interface ContractView {
  tid: string;
  level: number;
  icon: string;
}

// ContractDefinition.build copies the tid of the ContractNameDefinition named by the contract. ActionGetDefinitions
// numbers definitions without a tid attribute in file order, so contractsNames.xml entry n is TID_CONTRACT<n>
// (TID_CONTRACT1 = Tourists, TID_CONTRACT2 = Students, as in the locale).
export function parseContractViews(contracts: RulesNode, names: RulesNode): Map<string, ContractView> {
  const index = new Map((names._children ?? []).map((n, i) => [String(n.sku), i + 1]));
  const out = new Map<string, ContractView>();
  for (const n of contracts._children ?? []) {
    const i = index.get(String(n.name));
    out.set(String(n.sku), { tid: i ? `TID_CONTRACT${i}` : "", level: Number(n.level ?? 1), icon: String(n.icon ?? "contract_01") });
  }
  return out;
}

export interface Footprint {
  sid: number;
  def: ItemDefinition;
  tileX: number;
  tileY: number;
}

const num = (def: ItemDefinition, key: string) => Number(def.attributes[key] ?? 0) || 0;

function overlaps(area: { x0: number; y0: number; x1: number; y1: number }, f: Footprint): boolean {
  return f.tileX < area.x1 && f.tileX + f.def.baseCols > area.x0 && f.tileY < area.y1 && f.tileY + f.def.baseRows > area.y0;
}

// ItemObject.influenceLoopNeighbours: the item's base grown by influenceRatio tiles on every side.
export function influenceArea(f: Footprint) {
  const r = num(f.def, "influenceRatio");
  return { x0: f.tileX - r, y0: f.tileY - r, x1: f.tileX + f.def.baseCols + r, y1: f.tileY + f.def.baseRows + r };
}

type Area = ReturnType<typeof influenceArea>;
// Footprint lists are not modified after footprints() builds them, so the decorations of one list are found once
// and reused for every house checked against it.
const decorationCache = new WeakMap<Footprint[], Array<{ sid: number; area: Area; value: number }>>();

function influencingDecorations(all: Footprint[]) {
  let list = decorationCache.get(all);
  if (!list) {
    list = [];
    for (const d of all) {
      const value = d.def.kind === "decoration" ? num(d.def, "influenceValue") : 0;
      if (value) list.push({ sid: d.sid, area: influenceArea(d), value });
    }
    decorationCache.set(all, list);
  }
  return list;
}

// ItemObject.registerItemInfluence: a house gains the influenceValue of each decoration whose area covers it.
export function houseInfluencePercent(house: Footprint, all: Footprint[]): number {
  if (house.def.kind !== "house") return 0;
  let total = 0;
  for (const d of influencingDecorations(all)) if (d.sid !== house.sid && overlaps(d.area, house)) total += d.value;
  return total;
}

// ItemObject.getIncomeValue for a house: definition income plus contract income, then the influence bonus.
export function houseIncome(def: ItemDefinition, contract: Contract, influencePercent: number): { coins: number; xp: number } {
  const base = (num(def, "incomeValue") + contract.incomeCoins) >>> 0;
  const coins = (base + Math.trunc((base * influencePercent) / 100)) >>> 0;
  return { coins, xp: (num(def, "incomeXP") + contract.incomeXp) | 0 };
}

export function abandonTimeMs(rules: Rules, contract: Contract | undefined, fallbackMs: number): number {
  const base = contract && contract.incomeTimeMs > 0 ? contract.incomeTimeMs : Math.max(0, fallbackMs);
  return Math.max(Math.round((base * rules.settings.abandonTimePercentage) / 100), rules.settings.abandonMinTimeMs);
}

// ItemDefinition.set incomeTime: shop income times are in minutes, everything else in hours.
export function itemIncomeTimeMs(def: ItemDefinition): number {
  const t = num(def, "incomeTime");
  return def.kind === "commerce" ? t * 60_000 : t * 3_600_000;
}

// StateOnRent.isAffectedByType: a house counts for a shop only while it is renting or has rent ready.
export function countsForShop(mode: number | undefined): boolean {
  return mode === Mode.Renting || mode === Mode.GetRent;
}

// ItemObject.influenceGetItemsAffectedByCommerce: rented houses whose base lies in the shop's area.
export function shopCustomers(shop: Footprint, all: Footprint[], modeOf: (sid: number) => number | undefined): Footprint[] {
  const area = influenceArea(shop);
  return all.filter((h) => h.def.kind === "house" && countsForShop(modeOf(h.sid)) && overlaps(area, h));
}

// StateOnRent.onIncome for a shop: giveIncome once per customer house, each paying
// incomeValue x tenants (ItemObject.getIncomeValue) and the shop's incomeXP.
export function shopIncome(shop: Footprint, customers: Footprint[]): { coins: number; xp: number } {
  const perTenant = Math.trunc(num(shop.def, "incomeValue")) | 0;
  let coins = 0;
  for (const h of customers) coins += (perTenant * (Math.trunc(num(h.def, "tenants")) | 0)) >>> 0;
  return { coins, xp: (Math.trunc(num(shop.def, "incomeXP")) | 0) * customers.length };
}
