import { CONTRACT_SIGN_TIME_MS, Mode, abandonTimeMs, houseIncome, houseInfluencePercent, itemIncomeTimeMs, shopCustomers, shopIncome, } from "./economy.js";
import { relativeToTile } from "./geometry.js";
export const SAVE_VERSION = 3;
// Expansion areas owned at the start (expansions.xml, unlockedOrder 0).
export const INITIAL_AREAS = [14, 15, 20, 21];
const HOUSE_MODES_WITH_TIMER = new Set([Mode.Renting, Mode.GetRent, Mode.GivingRent, Mode.SigningContract, Mode.CancelingContract]);
// StateOnRent.CONTRACT_CANCEL_TIME: the cancel bar runs for 3 s, then the house waits for a new contract.
export const CONTRACT_CANCEL_TIME_MS = 3000;
export function importCity(file, now) {
    return {
        version: SAVE_VERSION,
        profile: {
            coins: Number(file.profile.DCCoins) || 0, cash: Number(file.profile.DCCash) || 0, exp: Number(file.profile.exp) || 0,
            cityName: file.profile.cityname ?? "", companyValue: Number(file.profile.companyValue) || 0,
            isFan: file.profile.isFan === "1",
        },
        items: file.items.map((it) => {
            const s = it.state;
            const state = s && s.mode !== undefined
                ? {
                    mode: Number(s.mode), timeMs: Number(s.time ?? 0), savedAt: Number(s.savedAt ?? now) || now, contractSku: s.contractSku,
                    cycle: `${it.sid}:${s.contractSku ?? "shop"}:import:${s.savedAt ?? now}`,
                }
                : undefined;
            return { sid: it.sid, sku: it.sku, x: it.x, y: it.y, state };
        }),
        roads: file.roads,
        terrain: file.terrain,
        areas: file.areas ?? [...INITIAL_AREAS],
        nextSid: Math.max(0, ...file.items.map((i) => i.sid)) + 1,
        missions: {
            up: [...(file.missions?.up ?? [])], reached: [...(file.missions?.reached ?? [])], given: [...(file.missions?.given ?? [])],
            counts: { ...(file.pollCounts ?? {}) },
        },
        storage: [],
        paidCycles: [],
    };
}
// Versioned, side-effect free migration of an older save document; returns null if unsupported.
export function migrateSave(data) {
    if (!data || typeof data !== "object")
        return null;
    let d = data;
    if (d.version === 1) {
        const items = Array.isArray(d.items) ? d.items : [];
        d = {
            ...d, version: 2, areas: [...INITIAL_AREAS], nextSid: Math.max(0, ...items.map((i) => i.sid)) + 1,
            profile: { ...d.profile, isFan: false },
        };
    }
    if (d.version === 2)
        d = { ...d, version: 3, missions: { up: [], reached: [], given: [], counts: {} }, storage: [] };
    return validateSave(d) ? d : null;
}
export function validateSave(data) {
    if (!data || typeof data !== "object")
        return false;
    const d = data;
    return d.version === SAVE_VERSION && !!d.profile && Number.isFinite(d.profile.coins) && Number.isFinite(d.profile.exp) &&
        Array.isArray(d.items) && d.items.every((i) => Number.isInteger(i.sid) && typeof i.sku === "string") &&
        Array.isArray(d.roads) && Array.isArray(d.terrain) && Array.isArray(d.paidCycles) && Array.isArray(d.areas) &&
        Number.isInteger(d.nextSid) && typeof d.profile.isFan === "boolean" && !!d.missions && Array.isArray(d.missions.up) &&
        Array.isArray(d.missions.reached) && Array.isArray(d.missions.given) && typeof d.missions.counts === "object" && Array.isArray(d.storage);
}
export class GameState {
    constructor(data, defs, rules) {
        this.data = data;
        this.defs = defs;
        this.rules = rules;
        this.paid = new Set(data.paidCycles);
    }
    footprints() {
        const out = [];
        for (const it of this.data.items) {
            const def = this.defs.get(it.sku);
            if (!def)
                continue;
            const t = relativeToTile(it.x, it.y);
            out.push({ sid: it.sid, def, tileX: t.x, tileY: t.y });
        }
        return out;
    }
    item(sid) {
        return this.data.items.find((i) => i.sid === sid);
    }
    // Advances house timers to `now` (same transitions as the local server's normalizeHouseRentState).
    advance(now) {
        const changed = [];
        for (const it of this.data.items) {
            const s = it.state;
            const def = this.defs.get(it.sku);
            if (!s || !def || def.kind !== "house" || !HOUSE_MODES_WITH_TIMER.has(s.mode))
                continue;
            const before = s.mode;
            let elapsed = Math.max(0, now - s.savedAt);
            if (s.mode === Mode.CancelingContract) {
                if (elapsed < s.timeMs) {
                    s.timeMs -= elapsed;
                    s.savedAt = now;
                }
                else {
                    it.state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: now };
                    changed.push(it.sid);
                }
                continue;
            }
            if (s.mode === Mode.SigningContract) {
                if (elapsed < s.timeMs)
                    continue;
                elapsed -= s.timeMs;
                const c = this.rules.contracts.get(s.contractSku ?? "");
                s.mode = Mode.Renting;
                s.timeMs = c ? c.incomeTimeMs : 0;
                s.savedAt = now - elapsed;
            }
            if (s.mode === Mode.Renting) {
                if (elapsed < s.timeMs) {
                    s.timeMs -= elapsed;
                    s.savedAt = now;
                }
                else {
                    const overdue = elapsed - s.timeMs;
                    const abandon = abandonTimeMs(this.rules, this.rules.contracts.get(s.contractSku ?? ""), s.timeMs);
                    s.mode = Mode.GetRent;
                    s.timeMs = abandon;
                    s.savedAt = now - overdue;
                    elapsed = overdue;
                }
            }
            if (s.mode === Mode.GetRent || s.mode === Mode.GivingRent) {
                if (elapsed >= s.timeMs) {
                    s.mode = Mode.Abandoned;
                    s.timeMs = 0;
                    s.savedAt = now;
                }
                else {
                    s.timeMs -= elapsed;
                    s.savedAt = now;
                }
            }
            if (s.mode !== before)
                changed.push(it.sid);
        }
        for (const sid of this.advanceShops(now))
            if (!changed.includes(sid))
                changed.push(sid);
        return changed;
    }
    modes() {
        return new Map(this.data.items.map((i) => [i.sid, i.state?.mode]));
    }
    customers(shopSid, all = this.footprints(), modes = this.modes()) {
        const shop = all.find((f) => f.sid === shopSid);
        return shop ? shopCustomers(shop, all, (sid) => modes.get(sid)) : [];
    }
    // Customers of every shop from one snapshot of footprints and house modes (the per-second mission check).
    allCustomerSids() {
        const all = this.footprints();
        const modes = this.modes();
        const out = new Map();
        for (const f of all)
            if (f.def.kind === "commerce")
                out.set(f.sid, shopCustomers(f, all, (sid) => modes.get(sid)).map((c) => c.sid));
        return out;
    }
    // StateOnRent.doDoLogicUpdate for shops: when the timer ends the shop has income ready only if it has
    // customers; otherwise it starts a new period. Ready income without customers returns to renting.
    // Houses are advanced first, so customers are judged with the houses' state at `now`.
    advanceShops(now) {
        const changed = [];
        // Only shop states change in this loop and customers are houses, so one snapshot serves every shop.
        const all = this.footprints();
        const modes = this.modes();
        for (const it of this.data.items) {
            const def = this.defs.get(it.sku);
            const s = it.state;
            if (!s || !def || def.kind !== "commerce")
                continue;
            const period = itemIncomeTimeMs(def);
            if (period <= 0)
                continue;
            const before = s.mode;
            const hasCustomers = this.customers(it.sid, all, modes).length > 0;
            if (s.mode === Mode.Renting) {
                let elapsed = Math.max(0, now - s.savedAt);
                if (elapsed < s.timeMs) {
                    s.timeMs -= elapsed;
                    s.savedAt = now;
                }
                else if (hasCustomers) {
                    s.mode = Mode.GetRent;
                    s.timeMs = 0;
                    s.savedAt = now;
                }
                else {
                    elapsed -= s.timeMs;
                    const rest = elapsed % period;
                    s.timeMs = period - rest;
                    s.savedAt = now;
                    s.cycle = `${it.sid}:shop:${now - rest}`;
                }
            }
            else if (s.mode === Mode.GetRent && !hasCustomers) {
                Object.assign(s, { mode: Mode.Renting, timeMs: period, savedAt: now, cycle: `${it.sid}:shop:${now}` });
            }
            if (s.mode !== before)
                changed.push(it.sid);
        }
        return changed;
    }
    shopIncomeFor(sid) {
        const it = this.item(sid);
        const def = it && this.defs.get(it.sku);
        if (!it || !def || def.kind !== "commerce")
            return null;
        const shop = this.footprints().find((f) => f.sid === sid);
        return shopIncome(shop, this.customers(sid));
    }
    customerSids(shopSid) {
        return this.customers(shopSid).map((f) => f.sid);
    }
    pay(cycle, reward) {
        if (this.paid.has(cycle))
            return false;
        this.paid.add(cycle);
        this.data.paidCycles.push(cycle);
        this.data.profile.coins += reward.coins;
        this.data.profile.exp += reward.xp;
        return true;
    }
    // Collecting shop income pays the period once and starts the next period.
    collectShop(sid, now) {
        this.advance(now);
        const it = this.item(sid);
        const def = it && this.defs.get(it.sku);
        const s = it?.state;
        if (!it || !def || !s || def.kind !== "commerce" || s.mode !== Mode.GetRent)
            return null;
        const reward = this.shopIncomeFor(sid);
        if (!reward || reward.coins <= 0)
            return null;
        if (!this.pay(s.cycle ?? `${sid}:shop:${s.savedAt}`, reward))
            return null;
        it.state = { mode: Mode.Renting, timeMs: itemIncomeTimeMs(def), savedAt: now, cycle: `${sid}:shop:${now}` };
        return reward;
    }
    // One state change: the mission becomes GIVEN and its reward lands in the profile and storage.
    claimMission(missions, sku) {
        const reward = missions.claim(sku);
        if (!reward)
            return null;
        this.data.profile.coins += reward.coins;
        this.data.profile.exp += reward.exp;
        this.data.storage.push(...reward.items);
        return reward;
    }
    collect(sid, now) {
        const def = this.defs.get(this.item(sid)?.sku ?? "");
        return def?.kind === "commerce" ? this.collectShop(sid, now) : this.collectRent(sid, now);
    }
    incomeFor(sid) {
        const it = this.item(sid);
        const def = it && this.defs.get(it.sku);
        const c = it?.state?.contractSku ? this.rules.contracts.get(it.state.contractSku) : undefined;
        if (!it || !def || !c)
            return null;
        const all = this.footprints();
        const self = all.find((f) => f.sid === sid);
        return houseIncome(def, c, houseInfluencePercent(self, all));
    }
    // Collecting rent pays the cycle once and returns the house to "waiting for contract".
    collectRent(sid, now) {
        this.advance(now);
        const it = this.item(sid);
        const s = it?.state;
        if (!it || !s || s.mode !== Mode.GetRent || !s.contractSku)
            return null;
        const reward = this.incomeFor(sid);
        if (!reward)
            return null;
        if (!this.pay(s.cycle ?? `${sid}:${s.contractSku}`, reward))
            return null;
        it.state = { mode: Mode.WaitingForContract, timeMs: 0, savedAt: now };
        return reward;
    }
    contractsFor(sid) {
        const it = this.item(sid);
        const def = it && this.defs.get(it.sku);
        return def ? this.rules.contractsByType.get(def.attributes.contractsTypeSku ?? "") ?? [] : [];
    }
    signContract(sid, contractSku, now) {
        const it = this.item(sid);
        const c = this.rules.contracts.get(contractSku);
        if (!it || !c || !this.contractsFor(sid).includes(contractSku))
            return false;
        const s = it.state;
        if (s && s.mode !== Mode.WaitingForContract && s.mode !== Mode.Abandoned)
            return false;
        if (this.data.profile.coins < c.costCoins)
            return false;
        this.data.profile.coins -= c.costCoins;
        it.state = { mode: Mode.SigningContract, timeMs: CONTRACT_SIGN_TIME_MS, savedAt: now, contractSku, cycle: `${sid}:${contractSku}:${now}` };
        return true;
    }
    // StateOnRent.doDoClick (MODE_RENTING, a house connected to the HQ) asks TID_CANCEL_CONTRACT; on accept
    // (contractCancelOnAccept) the mode becomes MODE_CANCELING_CONTRACT. Nothing is refunded.
    canCancelContract(sid) {
        const it = this.item(sid);
        return !!it && this.defs.get(it.sku)?.kind === "house" && it.state?.mode === Mode.Renting;
    }
    cancelContract(sid, now) {
        if (!this.canCancelContract(sid))
            return false;
        const it = this.item(sid);
        it.state = { mode: Mode.CancelingContract, timeMs: CONTRACT_CANCEL_TIME_MS, savedAt: now };
        return true;
    }
    snapshot() {
        return JSON.parse(JSON.stringify(this.data));
    }
}
//# sourceMappingURL=gameState.js.map