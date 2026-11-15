import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InvestmentLedger, NO_INVESTMENT_SOURCE, isInvestmentSuccessful, parseInvestDefinition } from "../public/js/game/investments.js";

const def = parseInvestDefinition(JSON.parse(readFileSync(new URL("../public/assets/rules/investDefinitions.json", import.meta.url))));

test("investDefinitions.xml: the base row, not the A/B row", () => {
  assert.deepEqual(def, { timeHours: 20, targetCompanyValue: 4_000_000, rewardCoins: 100_000, rewardCash: 0 });
});

test("success needs a finished investment and the friend's company value at the target", () => {
  assert.equal(isInvestmentSuccessful(def, true, 4_000_000), true);
  assert.equal(isInvestmentSuccessful(def, true, 3_999_999), false);
  assert.equal(isInvestmentSuccessful(def, false, 9_000_000), false);
});

test("success registers investmentDone and investment, failure only investment, each result once", () => {
  const l = new InvestmentLedger();
  assert.deepEqual(l.close(def, { extId: "a", done: true, friendCompanyValue: 5e6 }), [["investmentDone", ""], ["investment", ""]]);
  assert.equal(l.close(def, { extId: "a", done: true, friendCompanyValue: 5e6 }), null, "second close of the same result");
  assert.deepEqual(l.close(def, { extId: "b", done: true, friendCompanyValue: 1 }), [["investment", ""]]);
  assert.equal(l.close(def, { extId: "c", done: false, friendCompanyValue: 5e6 }), null, "still running");
  assert.equal(new InvestmentLedger(l.claimedIds).close(def, { extId: "b", done: true, friendCompanyValue: 1 }), null, "after a reload");
});

test("there is no local investment source, so no investment mission can be reached", async () => {
  assert.equal(NO_INVESTMENT_SOURCE.available, false);
  assert.deepEqual(await NO_INVESTMENT_SOURCE.results(), []);
});
