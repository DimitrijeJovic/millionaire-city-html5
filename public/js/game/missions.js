// MissionDefinition.getSkuToLoad: "<type>_<parameter>", or "<type>_<condition>" for beat missions.
export function missionImageSku(rule) {
    if (!rule.imageIsRequired)
        return null;
    return `${rule.type}_${rule.type === "beat" ? rule.condition : rule.parameter}`;
}
export function parseMissionRules(root) {
    const rules = [];
    const conditionCounters = new Map();
    for (const n of root._children ?? []) {
        // Missions marked showInABtest belong to the "alt_missions" A/B group, which the local game does not run.
        if (n.showInABtest !== undefined)
            continue;
        const type = String(n.type ?? "");
        const parameter = String(n.parameter ?? "");
        const eventSku = type + parameter;
        const amount = Number(n.amount ?? 0);
        if (!type || !(amount > 0))
            continue;
        const hasCondition = n.condition !== undefined && String(n.condition) !== "";
        let conditionIndex = -1;
        if (hasCondition) {
            conditionIndex = conditionCounters.get(eventSku) ?? 0;
            conditionCounters.set(eventSku, conditionIndex + 1);
        }
        rules.push({
            sku: Number(n.sku), name: String(n.missionName ?? ""), tid: String(n.tid ?? ""), type, parameter, eventSku, amount,
            conditionIndex, condition: hasCondition ? Number(n.condition) : null,
            unlockSku: n.unlockSku !== undefined ? Number(n.unlockSku) : null, unlockLevel: Number(n.unlockLevel ?? 0),
            rewardType: String(n.rewardType ?? ""), rewardAmount: String(n.rewardAmount ?? "0"), imageIsRequired: n.imageIsRequired === "1",
            feedImg: String(n.feedImg ?? ""),
        });
    }
    return rules;
}
export function missionReward(rule) {
    const types = rule.rewardType.split(";");
    const amounts = rule.rewardAmount.split(";").map(Number);
    const out = { coins: 0, exp: 0, items: [] };
    types.forEach((t, i) => {
        const a = amounts[i] ?? 0;
        if (t === "coins")
            out.coins += a;
        else if (t === "exp")
            out.exp += a;
        else if (t)
            for (let k = 0; k < a; k++)
                out.items.push(t);
    });
    return out;
}
export class Missions {
    constructor(rules, save) {
        this.rules = rules;
        this.save = save;
        this.bySku = new Map();
        this.conditionsByEvent = new Map();
        this.tracked = new Set();
        for (const r of rules) {
            this.bySku.set(r.sku, r);
            this.tracked.add(r.eventSku);
            if (r.condition !== null) {
                const list = this.conditionsByEvent.get(r.eventSku) ?? [];
                list[r.conditionIndex] = r.condition;
                this.conditionsByEvent.set(r.eventSku, list);
            }
        }
    }
    rule(sku) {
        return this.bySku.get(sku);
    }
    // PollManager.registerEvent: only events some mission listens to are counted.
    register(type, parameter = "") {
        const key = type + parameter;
        if (!this.tracked.has(key) || this.conditionsByEvent.has(key))
            return false;
        this.save.counts[key] = (this.save.counts[key] ?? 0) + 1;
        return true;
    }
    // PollEvent.checkCondition: each threshold of the event counts once, in definition order.
    check(type, parameter, value) {
        const key = type + parameter;
        const conditions = this.conditionsByEvent.get(key);
        if (!conditions)
            return false;
        let count = this.save.counts[key] ?? 0;
        const before = count;
        while (count < conditions.length && value >= conditions[count])
            count++;
        if (count === before)
            return false;
        this.save.counts[key] = count;
        return true;
    }
    isSatisfied(r) {
        const count = this.save.counts[r.eventSku] ?? 0;
        return r.conditionIndex >= 0 ? count > r.conditionIndex : count >= r.amount;
    }
    isUnlocked(r, level) {
        if (r.unlockSku !== null && !this.save.reached.includes(r.unlockSku) && !this.save.given.includes(r.unlockSku))
            return false;
        return level >= r.unlockLevel;
    }
    progress(sku) {
        const r = this.bySku.get(sku);
        if (!r)
            return { count: 0, amount: 0 };
        const count = this.save.counts[r.eventSku] ?? 0;
        return r.conditionIndex >= 0 ? { count: count > r.conditionIndex ? 1 : 0, amount: 1 } : { count: Math.min(count, r.amount), amount: r.amount };
    }
    // Moves missions forward only: unlocks and reaches, never gives a reward and never moves backwards.
    evaluate(level) {
        const changed = [];
        let progress = true;
        while (progress) {
            progress = false;
            for (const r of this.rules) {
                if (this.save.given.includes(r.sku) || this.save.reached.includes(r.sku))
                    continue;
                if (!this.isUnlocked(r, level))
                    continue;
                if (!this.save.up.includes(r.sku)) {
                    this.save.up.push(r.sku);
                    changed.push(r.sku);
                }
                if (this.isSatisfied(r)) {
                    this.save.up = this.save.up.filter((s) => s !== r.sku);
                    this.save.reached.push(r.sku);
                    changed.push(r.sku);
                    progress = true;
                }
            }
        }
        return changed;
    }
    // PopupName.saveName moves the nameCity mission straight to REACHED (MissionObject.changeState), without a poll count.
    markReached(sku) {
        const r = this.bySku.get(sku);
        if (!r || this.save.given.includes(sku) || this.save.reached.includes(sku) || !this.save.up.includes(sku))
            return false;
        this.save.up = this.save.up.filter((s) => s !== sku);
        this.save.reached.push(sku);
        return true;
    }
    // MissionObject.applyReward: the reward and the move to GIVEN happen together; a mission already
    // given (or not reached) yields nothing, so repeated or replayed claims cannot pay twice.
    claim(sku) {
        const r = this.bySku.get(sku);
        if (!r || this.save.given.includes(sku) || !this.save.reached.includes(sku))
            return null;
        this.save.reached = this.save.reached.filter((s) => s !== sku);
        this.save.given.push(sku);
        return missionReward(r);
    }
}
//# sourceMappingURL=missions.js.map