// investDefinitions.xml; the showInABTest row belongs to an A/B group that is not loaded.
export function parseInvestDefinition(root) {
    const d = (root._children ?? []).find((n) => n.showInABTest === undefined);
    if (!d)
        return null;
    return { timeHours: Number(d.time), targetCompanyValue: Number(d.target), rewardCoins: Number(d.rewardDCCoins), rewardCash: Number(d.rewardDCCash) };
}
// InvestObject.isSuccesfully: finished and the friend's company value reached the target.
export function isInvestmentSuccessful(def, done, friendCompanyValue) {
    return done && friendCompanyValue >= def.targetCompanyValue;
}
export const NO_INVESTMENT_SOURCE = { available: false, results: async () => [] };
// Closing PopupInvestSuccess registers investmentDone and investment; closing PopupInvestFail registers investment.
// InvestManager.applyInvestmentDone marks the investment claimed, so each result is reported once.
export class InvestmentLedger {
    constructor(claimed = []) {
        this.claimed = new Set(claimed);
    }
    close(def, r) {
        if (!r.done || this.claimed.has(r.extId))
            return null;
        this.claimed.add(r.extId);
        return isInvestmentSuccessful(def, r.done, r.friendCompanyValue) ? [["investmentDone", ""], ["investment", ""]] : [["investment", ""]];
    }
    get claimedIds() {
        return [...this.claimed];
    }
}
//# sourceMappingURL=investments.js.map