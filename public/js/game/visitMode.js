import { Mode } from "./economy.js";
// Visiting an NPC city (DollarsGame.changeState, visitor role) with the original offline data. The visitor plays
// in the owner's city: the map, items, roads and terrain are the visited city's, while money, experience,
// missions and storage stay the visitor's own. Only those visitor parts are ever written back to the player's save;
// the NPC city itself is loaded fresh from its original file on every visit and never stored.
export const NPC_CITY_FILES = ["npc_advisor", "npc_boss"];
export function isNpcCityFile(name) {
    return name !== null && NPC_CITY_FILES.includes(name);
}
export function composeVisitSave(own, visited) {
    return { ...visited, profile: { ...own.profile }, missions: structuredClone(own.missions), storage: [...own.storage],
        paidCycles: [...own.paidCycles] };
}
// The player's save after a visit: the own city untouched, the visitor's profile, missions and storage updated.
export function mergeVisitorProgress(own, visit) {
    return { ...own, profile: { ...visit.profile }, missions: structuredClone(visit.missions), storage: [...visit.storage] };
}
// StateOnRentVisitor.doIsMouseOverEnabled: a visitor can upgrade a house (ItemDefinition.isUpgradeAllowed: houses,
// not the headquarters) while it is renting (MODE_RENTING) and has not been upgraded yet.
export function isUpgradable(def, mode) {
    return def.kind === "house" && mode === Mode.Renting;
}
export function dayKey(now) {
    return new Date(now).toISOString().slice(0, 10);
}
export function parseVisitLedger(raw, now) {
    let d = {};
    try {
        d = JSON.parse(raw ?? "{}") ?? {};
    }
    catch {
        d = {};
    }
    const lastUpgrade = {};
    for (const [k, v] of Object.entries(d.lastUpgrade ?? {}))
        if (typeof v === "number" && Number.isFinite(v))
            lastUpgrade[k] = v;
    const day = dayKey(now);
    return { lastUpgrade, day, today: d.day === day && typeof d.today === "number" ? d.today : 0 };
}
// One stay in an NPC city. Upgrades pay the visitor UPGRADE_TYPE_NORMAL values: NPC neighbours are not partners
// (UpgradesManager.setNeighborId gives the super type only to partners).
export class NpcVisit {
    constructor(city, target, rules, ledger) {
        this.city = city;
        this.target = target;
        this.rules = rules;
        this.ledger = ledger;
        this.used = 0;
    }
    get remaining() {
        return Math.max(0, this.rules.maxItemsPerVisit - this.used);
    }
    key(sid) {
        return `${this.city}:${sid}`;
    }
    check(sid, def, mode, now) {
        if (!isUpgradable(def, mode))
            return "not_upgradable";
        const last = this.ledger.lastUpgrade[this.key(sid)];
        if (last !== undefined && now - last < this.rules.repeatUpgradeMs)
            return "too_soon";
        if (this.used >= this.rules.maxItemsPerVisit)
            return "visit_limit";
        if (dayKey(now) === this.ledger.day && this.ledger.today >= this.rules.maxUpgradesPerDay)
            return "day_limit";
        return null;
    }
    upgrade(sid, def, mode, now) {
        if (this.check(sid, def, mode, now) !== null)
            return null;
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
//# sourceMappingURL=visitMode.js.map