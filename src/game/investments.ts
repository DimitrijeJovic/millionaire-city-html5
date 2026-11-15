import { MissionEvent } from "./missionEvents.js";

// Investing in a friend (InvestManager). Everything that decides an investment lives on the server: the friends
// that can be invested in (friendsToInvest), the friend's company value at the end and the reward. The client only
// starts an investment (TASK_INVEST, INVEST_TYPE_ON_FRIEND), shows the result and reports it back
// (INVEST_TYPE_RESULTS); it never pays rewardDCCoins itself. Without that server there is no source here.

export interface InvestDefinition {
  timeHours: number;
  targetCompanyValue: number;
  rewardCoins: number;
  rewardCash: number;
}

// investDefinitions.xml; the showInABTest row belongs to an A/B group that is not loaded.
export function parseInvestDefinition(root: { _children?: Array<Record<string, unknown>> }): InvestDefinition | null {
  const d = (root._children ?? []).find((n) => n.showInABTest === undefined);
  if (!d) return null;
  return { timeHours: Number(d.time), targetCompanyValue: Number(d.target), rewardCoins: Number(d.rewardDCCoins), rewardCash: Number(d.rewardDCCash) };
}

// InvestObject.isSuccesfully: finished and the friend's company value reached the target.
export function isInvestmentSuccessful(def: InvestDefinition, done: boolean, friendCompanyValue: number): boolean {
  return done && friendCompanyValue >= def.targetCompanyValue;
}

export interface InvestmentResult {
  extId: string;
  done: boolean;
  friendCompanyValue: number;
}

export interface InvestmentSource {
  readonly available: boolean;
  results(): Promise<InvestmentResult[]>;
}

export const NO_INVESTMENT_SOURCE: InvestmentSource = { available: false, results: async () => [] };

// Closing PopupInvestSuccess registers investmentDone and investment; closing PopupInvestFail registers investment.
// InvestManager.applyInvestmentDone marks the investment claimed, so each result is reported once.
export class InvestmentLedger {
  private claimed: Set<string>;

  constructor(claimed: Iterable<string> = []) {
    this.claimed = new Set(claimed);
  }

  close(def: InvestDefinition, r: InvestmentResult): MissionEvent[] | null {
    if (!r.done || this.claimed.has(r.extId)) return null;
    this.claimed.add(r.extId);
    return isInvestmentSuccessful(def, r.done, r.friendCompanyValue) ? [["investmentDone", ""], ["investment", ""]] : [["investment", ""]];
  }

  get claimedIds(): string[] {
    return [...this.claimed];
  }
}
