import { ItemDefinition } from "./definitions.js";
import { MissionEvent, itemEvents } from "./missionEvents.js";

// Visiting another city (DollarsGame.changeState in the visitor role) and upgrading its houses
// (StateOnRentVisitor.doDoClick). The original loads the visited city from the game server: a friend's city,
// a partner's, or an NPC city such as Ronald's. The local game has no such source, so CitySource only defines
// what a future source must provide; NO_CITY_SOURCE returns nothing and visits stay unavailable.

export interface UpgradeValues {
  visitorCoins: number;
  visitorExp: number;
  ownerExtraPercentage: number;
}

// normal / super come from RulesFacade.socialLoadOnComplete (UPGRADE_TYPE_NORMAL and UPGRADE_TYPE_SUPER; partners get
// super, UpgradesManager.setNeighborId). The client never reads the three limits: the number of upgrades per visit
// arrives as upgradesUniverseAvailable in the server's upgrades list (UpgradesManager.load), whose offline file
// (userData/upgradesList.xml) is not in the installation. The limits here are the social.xml values the server is
// assumed to have used.
export interface SocialRules {
  normal: UpgradeValues;
  super: UpgradeValues;
  maxItemsPerVisit: number;
  repeatUpgradeMs: number;
  maxUpgradesPerDay: number;
}
export function parseSocialRules(root: { _children?: Array<Record<string, unknown>> }): SocialRules {
  const d = root._children?.[0] ?? {};
  const n = (k: string, fallback: number) => (d[k] !== undefined ? Number(d[k]) : fallback);
  return {
    normal: { visitorCoins: n("upgradesVisitorDCCoinsPerUpgrade", 100), visitorExp: n("upgradesVisitorExpPerUpgrade", 10),
      ownerExtraPercentage: n("upgradesOwnerExtraPercentage", 10) },
    super: { visitorCoins: n("superUpgradesVisitorDCCoinsPerUpgrade", 150), visitorExp: n("superUpgradesVisitorExpPerUpgrade", 15),
      ownerExtraPercentage: n("superUpgradesOwnerExtraPercentage", 12) },
    maxItemsPerVisit: n("upgrade_maximunOf_items", 5),
    repeatUpgradeMs: n("upgrade_repeatUpgrades_time", 12) * 3_600_000,
    maxUpgradesPerDay: n("maxUpgradesPerDay", 1500),
  };
}

export interface VisitTarget {
  ownerId: string;
  cityName: string;
  // The first NPC (NPCDefinitions index 0) is Ronald.
  isRonald: boolean;
  isPartner: boolean;
}

// A visited city as a source must deliver it: the owner's items with their rent state and last upgrade time.
export interface VisitedItem {
  key: string;
  def: ItemDefinition;
  renting: boolean;
  lastUpgradeAt: number | null;
}

export interface VisitedCity {
  target: VisitTarget;
  items: VisitedItem[];
}

export interface CitySource {
  readonly available: boolean;
  load(ownerId: string): Promise<VisitedCity | null>;
}

export const NO_CITY_SOURCE: CitySource = { available: false, load: async () => null };

export interface NpcDefinition {
  name: string;
}

// UserDataFacadeOffline.requestTask: the last NPC (UserDataFacade.isBossNPC, Sheik) loads
// universeAdvisorCity1_AbuDabhi.xml, every other NPC universeAdvisorCity.xml; friends would load universeFriend.xml,
// which the installation does not contain. tools/convert_universe_xml.py turns the two files into npc_boss.json and
// npc_advisor.json.
export function npcCityFile(npcs: NpcDefinition[], name: string): string | null {
  const i = npcs.findIndex((n) => n.name === name);
  if (i < 0) return null;
  return i === npcs.length - 1 ? "npc_boss" : "npc_advisor";
}

export function npcTarget(npcs: NpcDefinition[], name: string, cityName: string): VisitTarget {
  return { ownerId: "npc:" + name, cityName, isRonald: npcs[0]?.name === name, isPartner: false };
}

interface CityFileLike {
  profile: { cityname?: string };
  items: Array<{ sid: number; sku: string; state?: Record<string, string> }>;
}

// StateItemObject.STATE_ON_RENT_ID = 1: StateOnRentVisitor handles clicks on houses in that state.
const STATE_ON_RENT_ID = "1";

export class OfflineNpcCitySource implements CitySource {
  readonly available = true;

  constructor(private readonly npcs: NpcDefinition[], private readonly defs: Map<string, ItemDefinition>,
    private readonly fetchCity: (file: string) => Promise<CityFileLike | null>) {}

  async load(ownerId: string): Promise<VisitedCity | null> {
    if (!ownerId.startsWith("npc:")) return null;
    const name = ownerId.slice(4);
    const file = npcCityFile(this.npcs, name);
    const city = file ? await this.fetchCity(file) : null;
    if (!city) return null;
    const items: VisitedItem[] = [];
    for (const it of city.items) {
      const def = this.defs.get(it.sku);
      if (def) items.push({ key: String(it.sid), def, renting: it.state?.id === STATE_ON_RENT_ID, lastUpgradeAt: null });
    }
    return { target: npcTarget(this.npcs, name, city.profile.cityname ?? ""), items };
  }
}

// DollarsGame.changeState, visitor role: visitFriend (visitRonald for NPC 0), visitPartner for partners, then visitCity.
export function visitMissionEvents(t: VisitTarget): MissionEvent[] {
  const out: MissionEvent[] = [[t.isRonald ? "visitRonald" : "visitFriend", ""]];
  if (t.isPartner) out.push(["visitPartner", ""]);
  out.push(["visitCity", ""]);
  return out;
}

export type UpgradeRefusal = "not_house" | "not_renting" | "too_soon" | "visit_limit" | "day_limit";

export interface UpgradeResult {
  coins: number;
  exp: number;
  events: MissionEvent[];
}

// One stay in a visited city. UpgradesManager.isAnyUpgradeAllowed / upgradeItem count the allowance down; the
// allowance itself, the 12 h repeat and the daily cap are the assumed server rules described at SocialRules.
export class VisitSession {
  private used = 0;

  constructor(private readonly rules: SocialRules, readonly city: VisitedCity, private upgradesToday = 0) {}

  get remaining(): number {
    return Math.max(0, this.rules.maxItemsPerVisit - this.used);
  }

  canUpgrade(item: VisitedItem, now: number): UpgradeRefusal | null {
    if (item.def.kind !== "house") return "not_house";
    if (!item.renting) return "not_renting";
    if (item.lastUpgradeAt !== null && now - item.lastUpgradeAt < this.rules.repeatUpgradeMs) return "too_soon";
    if (this.used >= this.rules.maxItemsPerVisit) return "visit_limit";
    if (this.upgradesToday >= this.rules.maxUpgradesPerDay) return "day_limit";
    return null;
  }

  // StateOnRentVisitor.doDoClick: upgradeApply, MISSION_EVENT_UPGRADE through ItemObject.registerEvent, then the
  // visitor gets DCCoins and experience per upgrade.
  upgrade(item: VisitedItem, now: number): UpgradeResult | null {
    if (this.canUpgrade(item, now) !== null) return null;
    this.used++;
    this.upgradesToday++;
    item.lastUpgradeAt = now;
    const v = this.city.target.isPartner ? this.rules.super : this.rules.normal;
    return { coins: v.visitorCoins, exp: v.visitorExp, events: itemEvents("upgrade", item.def) };
  }
}
