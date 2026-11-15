import { itemEvents } from "./missionEvents.js";
export function parseSocialRules(root) {
    const d = root._children?.[0] ?? {};
    const n = (k, fallback) => (d[k] !== undefined ? Number(d[k]) : fallback);
    return {
        normal: { visitorCoins: n("upgradesVisitorDCCoinsPerUpgrade", 100), visitorExp: n("upgradesVisitorExpPerUpgrade", 10),
            ownerExtraPercentage: n("upgradesOwnerExtraPercentage", 10) },
        super: { visitorCoins: n("superUpgradesVisitorDCCoinsPerUpgrade", 150), visitorExp: n("superUpgradesVisitorExpPerUpgrade", 15),
            ownerExtraPercentage: n("superUpgradesOwnerExtraPercentage", 12) },
        maxItemsPerVisit: n("upgrade_maximunOf_items", 5),
        repeatUpgradeMs: n("upgrade_repeatUpgrades_time", 12) * 3600000,
        maxUpgradesPerDay: n("maxUpgradesPerDay", 1500),
    };
}
export const NO_CITY_SOURCE = { available: false, load: async () => null };
// UserDataFacadeOffline.requestTask: the last NPC (UserDataFacade.isBossNPC, Sheik) loads
// universeAdvisorCity1_AbuDabhi.xml, every other NPC universeAdvisorCity.xml; friends would load universeFriend.xml,
// which the installation does not contain. tools/convert_universe_xml.py turns the two files into npc_boss.json and
// npc_advisor.json.
export function npcCityFile(npcs, name) {
    const i = npcs.findIndex((n) => n.name === name);
    if (i < 0)
        return null;
    return i === npcs.length - 1 ? "npc_boss" : "npc_advisor";
}
export function npcTarget(npcs, name, cityName) {
    return { ownerId: "npc:" + name, cityName, isRonald: npcs[0]?.name === name, isPartner: false };
}
// StateItemObject.STATE_ON_RENT_ID = 1: StateOnRentVisitor handles clicks on houses in that state.
const STATE_ON_RENT_ID = "1";
export class OfflineNpcCitySource {
    constructor(npcs, defs, fetchCity) {
        this.npcs = npcs;
        this.defs = defs;
        this.fetchCity = fetchCity;
        this.available = true;
    }
    async load(ownerId) {
        if (!ownerId.startsWith("npc:"))
            return null;
        const name = ownerId.slice(4);
        const file = npcCityFile(this.npcs, name);
        const city = file ? await this.fetchCity(file) : null;
        if (!city)
            return null;
        const items = [];
        for (const it of city.items) {
            const def = this.defs.get(it.sku);
            if (def)
                items.push({ key: String(it.sid), def, renting: it.state?.id === STATE_ON_RENT_ID, lastUpgradeAt: null });
        }
        return { target: npcTarget(this.npcs, name, city.profile.cityname ?? ""), items };
    }
}
// DollarsGame.changeState, visitor role: visitFriend (visitRonald for NPC 0), visitPartner for partners, then visitCity.
export function visitMissionEvents(t) {
    const out = [[t.isRonald ? "visitRonald" : "visitFriend", ""]];
    if (t.isPartner)
        out.push(["visitPartner", ""]);
    out.push(["visitCity", ""]);
    return out;
}
// One stay in a visited city. UpgradesManager.isAnyUpgradeAllowed / upgradeItem count the allowance down; the
// allowance itself, the 12 h repeat and the daily cap are the assumed server rules described at SocialRules.
export class VisitSession {
    constructor(rules, city, upgradesToday = 0) {
        this.rules = rules;
        this.city = city;
        this.upgradesToday = upgradesToday;
        this.used = 0;
    }
    get remaining() {
        return Math.max(0, this.rules.maxItemsPerVisit - this.used);
    }
    canUpgrade(item, now) {
        if (item.def.kind !== "house")
            return "not_house";
        if (!item.renting)
            return "not_renting";
        if (item.lastUpgradeAt !== null && now - item.lastUpgradeAt < this.rules.repeatUpgradeMs)
            return "too_soon";
        if (this.used >= this.rules.maxItemsPerVisit)
            return "visit_limit";
        if (this.upgradesToday >= this.rules.maxUpgradesPerDay)
            return "day_limit";
        return null;
    }
    // StateOnRentVisitor.doDoClick: upgradeApply, MISSION_EVENT_UPGRADE through ItemObject.registerEvent, then the
    // visitor gets DCCoins and experience per upgrade.
    upgrade(item, now) {
        if (this.canUpgrade(item, now) !== null)
            return null;
        this.used++;
        this.upgradesToday++;
        item.lastUpgradeAt = now;
        const v = this.city.target.isPartner ? this.rules.super : this.rules.normal;
        return { coins: v.visitorCoins, exp: v.visitorExp, events: itemEvents("upgrade", item.def) };
    }
}
//# sourceMappingURL=visits.js.map