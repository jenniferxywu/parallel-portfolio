export function reportingValue(amount, currency, rates, reportingCurrency = "SGD") {
  if (currency === reportingCurrency) return Number(amount);
  const rate = rates[`${currency}/${reportingCurrency}`];
  return rate == null ? null : Number(amount) * Number(rate);
}

export function accountValue({ authoritativeTotal, cash = [], positions = [] }) {
  return authoritativeTotal == null
    ? [...cash, ...positions].reduce((sum, value) => sum + Number(value), 0)
    : Number(authoritativeTotal);
}

export function eventNetWorthChange(legs, rates, reportingCurrency = "SGD") {
  let total = 0;
  for (const leg of legs) {
    if (leg.ownershipScope === "EXTERNAL") continue;
    const value = reportingValue(leg.signedAmount, leg.currency, rates, reportingCurrency);
    if (value == null) return { value: null, status: "UNRECONCILED" };
    total += value;
  }
  return { value: total, status: "COMPLETE" };
}

export function investmentGain({ endingValue, beginningValue, contributions, withdrawals }) {
  if ([endingValue, beginningValue, contributions, withdrawals].some((value) => value == null)) return null;
  return Number(endingValue) - Number(beginningValue) - Number(contributions) + Number(withdrawals);
}
