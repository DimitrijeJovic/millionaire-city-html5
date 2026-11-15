import { ItemDefinition } from "./definitions.js";
import { Mode } from "./economy.js";
import { SaveData } from "./gameState.js";
import { SocialRules, VisitTarget } from "./visits.js";

// Visiting an NPC city (DollarsGame.changeState, visitor role) with the original offline data. The visitor plays
// in the owner's city: the map, items, roads and terrain are the visited city's, while money, experience,
// missions and storage stay the visitor's own. Only those visitor parts are ever written back to the player's save;
// the NPC city itself is loaded fresh from its original file on every visit and never stored.
export const NPC_CITY_FILES = ["npc_advisor", "npc_boss"] as const;
export type NpcCityFile = (typeof NPC_CITY_FILES)[number];

export function isNpcCityFile(name: string | null): name is NpcCityFile {
  return name !== null && (NPC_CITY_FILES as readonly string[]).includes(name);
}

export function composeVisitSave(own: SaveData, visited: SaveData): SaveData {
  return { ...visited, profile: { ...own.profile }, missions: structuredClone(own.missions), storage: [...own.storage],
    paidCycles: [...own.paidCycles] };
}

// The player's save after a visit: the own city untouched, the visitor's profile, missions and storage updated.
export function mergeVisitorProgress(own: SaveData, visit: SaveData): SaveData {
  return { ...own, profile: { ...visit.profile }, missions: structuredClone(visit.missions), storage: [...visit.storage] };
}

// StateOnRentVisitor.doIsMouseOverEnabled: a visitor can upgrade a house (ItemDefinition.isUpgradeAllowed: houses,
// not the headquarters) while it is renting (MODE_RENTING) and has not been upgraded yet.
export function isUpgradable(def: ItemDefinition, mode: number | undefined): boolean {
  return def.kind === "house" && mode === Mode.Renting;
}

// What the original server kept for upgrades, stored locally: when each NPC house was last upgraded and how many
// upgrades were made today. The 12 h repeat, five per visit and 1500 per day are the social.xml values the server
// is assumed to have applied (see SocialRules); the client itself only received the remaining count.
export interface VisitLedgerData {
  lastUpgrade: Record<string, number>;
  day: string;
  today: number;
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function parseVisitLedger(raw: string | null, now: number): VisitLedgerData {
  let d: Partial<VisitLedgerData> = {};
  try {
    d = (JSON.parse(raw ?? "{}") as Partial<VisitLedgerData>) ?? {};
  } catch {
    d = {};
  }
  const lastUpgrade: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.lastUpgrade ?? {})) if (typeof v === "number" && Number.isFinite(v)) lastUpgrade[k] = v;
  const day = dayKey(now);
  return { lastUpgrade, day, today: d.day === day && typeof d.today === "number" ? d.today : 0 };
}

export type VisitUpgradeRefusal = "not_upgradable" | "too_soon" | "visit_limit" | "day_limit";

// One stay in an NPC city. Upgrades pay the visitor UPGRADE_TYPE_NORMAL values: NPC neighbours are not partners
// (UpgradesManager.setNeighborId gives the super type only to partners).
export class NpcVisit {
  private used = 0;

  constructor(readonly city: NpcCityFile, readonly target: VisitTarget, private readonly rules: SocialRules,
    readonly ledger: VisitLedgerData) {}

  get remaining(): number {
    return Math.max(0, this.rules.maxItemsPerVisit - this.used);
  }

  private key(sid: number): string {
    return `${this.city}:${sid}`;
  }

  check(sid: number, def: ItemDefinition, mode: number | undefined, now: number): VisitUpgradeRefusal | null {
    if (!isUpgradable(def, mode)) return "not_upgradable";
    const last = this.ledger.lastUpgrade[this.key(sid)];
    if (last !== undefined && now - last < this.rules.repeatUpgradeMs) return "too_soon";
    if (this.used >= this.rules.maxItemsPerVisit) return "visit_limit";
    if (dayKey(now) === this.ledger.day && this.ledger.today >= this.rules.maxUpgradesPerDay) return "day_limit";
    return null;
  }

  upgrade(sid: number, def: ItemDefinition, mode: number | undefined, now: number): { coins: number; exp: number } | null {
    if (this.check(sid, def, mode, now) !== null) return null;
    this.used++;
    if (dayKey(now) !== this.ledger.day) {
      this.ledger.day = dayKey(now);
      this.ledger.today = 0;
    }
    this.ledger.today++;
    this.ledger.lastUpgrade[this.key(sid)] = now;
    const v = this.target.isPartner ? this.rules.super : this.rules.normal;
    return { coins: v.visitorCoins, exp: v.visitorExp };
  }
}
