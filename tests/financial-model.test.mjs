import assert from "node:assert/strict";
import test from "node:test";
import { accountValue, eventNetWorthChange, investmentGain } from "../lib/financial-model.js";

test("internal transfers do not create net worth", () => {
  const result = eventNetWorthChange([
    { signedAmount: "-5000", currency: "SGD", ownershipScope: "OWNED_ACCOUNT" },
    { signedAmount: "5000", currency: "SGD", ownershipScope: "OWNED_ACCOUNT" },
  ], {});
  assert.deepEqual(result, { value: 0, status: "COMPLETE" });
});

test("missing FX is unreconciled, never treated as 1:1", () => {
  const result = eventNetWorthChange([{ signedAmount: "400", currency: "USD", ownershipScope: "OWNED_ACCOUNT" }], {});
  assert.deepEqual(result, { value: null, status: "UNRECONCILED" });
});

test("authoritative account equity is counted once", () => {
  assert.equal(accountValue({ authoritativeTotal: "1000", cash: [300], positions: [900] }), 1000);
});

test("funding is excluded from investment gain", () => {
  assert.equal(investmentGain({ endingValue: 1200, beginningValue: 500, contributions: 400, withdrawals: 0 }), 300);
  assert.equal(investmentGain({ endingValue: 1200, beginningValue: null, contributions: 400, withdrawals: 0 }), null);
});
