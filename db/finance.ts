import { getD1 } from "./index";

export type SnapshotAccount = {
  accountId: "moomoo" | "bitget";
  source: "MOOMOO_API" | "BITGET_API";
  asOf: number;
  valuation?: { amount: string; currency: string };
  valuationStatus?: "COMPLETE" | "PARTIAL";
  cash: Array<{ currency: string; amount: string }>;
  cashStatus?: "COMPLETE" | "PARTIAL";
  positions: Array<{
    symbol: string; name: string; assetType: string; externalPositionId: string; quantity: string;
    averageCost?: string; costCurrency?: string; currentPrice?: string; priceCurrency?: string;
    marketValue?: string; unrealizedPnl?: string; metadata?: Record<string, unknown>;
  }>;
  fxRates?: Array<{ base: string; quote: string; rate: string; source: string }>;
};

const accounts = [
  ["dbs", "DBS", "DBS", "BANK", "SG", "SGD"], ["hsbc", "HSBC", "HSBC", "BANK", "SG", "SGD"],
  ["uob", "UOB", "UOB", "BANK", "SG", "SGD"], ["moomoo", "Moomoo", "Moomoo", "BROKERAGE", "SG", "SGD"],
  ["bitget", "Bitget", "Bitget", "CRYPTO_EXCHANGE", null, "USD"],
  ["guotai_haitong", "Guotai Haitong / 国泰海通", "Guotai Haitong", "BROKERAGE", "CN", "CNY"],
] as const;

const events = [
  ["manual_moomoo_hsbc_5000", "INTERNAL_TRANSFER", null, null, null, "PARTIAL", "HSBC to Moomoo; transaction date missing"],
  ["manual_moomoo_dbs_5000", "INTERNAL_TRANSFER", null, null, null, "PARTIAL", "DBS to Moomoo; transaction date missing"],
  ["manual_bitget_sgd1500_usd1148_24", "INTERNAL_TRANSFER", "14", "SGD", null, "UNRECONCILED", "Source bank and fee treatment are unknown"],
  ["manual_bitget_salary_usd400", "EXTERNAL_INCOME", null, null, null, "PARTIAL", "Salary paid directly to Bitget; transaction date missing"],
  ["manual_guotai_cny10000", "ADJUSTMENT", null, null, null, "UNRECONCILED", "Funding source, date, and fee are unknown"],
] as const;

const legs = [
  ["leg_moomoo_hsbc_source", events[0][0], "hsbc", "SOURCE", "OWNED_ACCOUNT", "-5000", "SGD"],
  ["leg_moomoo_hsbc_destination", events[0][0], "moomoo", "DESTINATION", "OWNED_ACCOUNT", "5000", "SGD"],
  ["leg_moomoo_dbs_source", events[1][0], "dbs", "SOURCE", "OWNED_ACCOUNT", "-5000", "SGD"],
  ["leg_moomoo_dbs_destination", events[1][0], "moomoo", "DESTINATION", "OWNED_ACCOUNT", "5000", "SGD"],
  ["leg_bitget_sgd_source", events[2][0], null, "SOURCE", "OWNED_UNKNOWN", "-1500", "SGD"],
  ["leg_bitget_usd_destination", events[2][0], "bitget", "DESTINATION", "OWNED_ACCOUNT", "1148.24", "USD"],
  ["leg_bitget_salary_destination", events[3][0], "bitget", "DESTINATION", "OWNED_ACCOUNT", "400", "USD"],
  ["leg_guotai_destination", events[4][0], "guotai_haitong", "DESTINATION", "OWNED_ACCOUNT", "10000", "CNY"],
] as const;

export async function seedKnownHistory() {
  const db = getD1();
  const now = Date.now();
  const statements = accounts.map((row) => db.prepare(`INSERT OR IGNORE INTO accounts
    (id,name,institution,account_type,country,base_currency,is_active,included_in_net_worth,created_at,metadata)
    VALUES (?,?,?,?,?,?,1,1,?, '{}')`).bind(...row, now));
  for (const row of events) statements.push(db.prepare(`INSERT OR IGNORE INTO financial_events
    (id,transaction_type,fee_amount,fee_currency,fee_treatment,data_source,reconciliation_status,dedupe_key,note,created_at,updated_at)
    VALUES (?,?,?,?,?,'MANUAL',?,?,?, ?,?)`).bind(row[0], row[1], row[2], row[3], row[4], row[5], row[0], row[6], now, now));
  for (const row of legs) statements.push(db.prepare(`INSERT OR IGNORE INTO cash_legs
    (id,event_id,account_id,leg_role,ownership_scope,signed_amount,currency,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(...row, now));
  await db.batch(statements);
}

export async function saveSnapshots(accountsToSave: SnapshotAccount[]) {
  const db = getD1();
  const statements: ReturnType<typeof db.prepare>[] = [];
  for (const account of accountsToSave) {
    const bucket = Math.floor(account.asOf / 900_000) * 900_000; // ponytail: 15-minute history; tighten only when intraday analytics exist.
    if (account.valuation) statements.push(db.prepare(`INSERT OR IGNORE INTO account_valuation_snapshots
      (id,account_id,total_value,currency,as_of,data_source,external_snapshot_id,reconciliation_status) VALUES (?,?,?,?,?,?,?, ?)`)
      .bind(`${account.source}:${account.accountId}:value:${bucket}`, account.accountId, account.valuation.amount, account.valuation.currency, bucket, account.source, `${account.accountId}:${bucket}`, account.valuationStatus ?? "COMPLETE"));
    for (const cash of account.cash) statements.push(db.prepare(`INSERT OR IGNORE INTO cash_balance_snapshots
      (id,account_id,currency,native_balance,as_of,data_source,external_snapshot_id,reconciliation_status) VALUES (?,?,?,?,?,?,?, ?)`)
      .bind(`${account.source}:${account.accountId}:cash:${cash.currency}:${bucket}`, account.accountId, cash.currency, cash.amount, bucket, account.source, `${cash.currency}:${bucket}`, account.cashStatus ?? "COMPLETE"));
    for (const position of account.positions) {
      const assetId = `${position.assetType}:${position.symbol}`;
      statements.push(db.prepare(`INSERT OR IGNORE INTO assets (id,symbol,name,asset_type,metadata) VALUES (?,?,?,?, '{}')`)
        .bind(assetId, position.symbol, position.name, position.assetType));
      statements.push(db.prepare(`INSERT OR IGNORE INTO position_snapshots
        (id,account_id,asset_id,external_position_id,quantity,average_cost,cost_currency,current_price,price_currency,market_value,unrealized_pnl,as_of,data_source,reconciliation_status,metadata)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'COMPLETE',?)`).bind(
          `${account.source}:${account.accountId}:position:${position.externalPositionId}:${bucket}`, account.accountId, assetId,
          position.externalPositionId, position.quantity, position.averageCost ?? null, position.costCurrency ?? null,
          position.currentPrice ?? null, position.priceCurrency ?? null, position.marketValue ?? null,
          position.unrealizedPnl ?? null, bucket, account.source, JSON.stringify(position.metadata ?? {}),
        ));
    }
    for (const rate of account.fxRates ?? []) statements.push(db.prepare(`INSERT OR IGNORE INTO fx_rates
      (id,base_currency,quote_currency,rate,rate_at,rate_type,source) VALUES (?,?,?,?,?,'CURRENT',?)`)
      .bind(`${rate.source}:${rate.base}:${rate.quote}:${bucket}`, rate.base, rate.quote, rate.rate, bucket, rate.source));
  }
  if (statements.length) await db.batch(statements);
}

export async function getFundingSummary() {
  const result = await getD1().prepare(`SELECT l.account_id AS accountId, l.currency,
    SUM(CAST(l.signed_amount AS REAL)) AS amount,
    CASE WHEN SUM(CASE WHEN e.reconciliation_status = 'COMPLETE' THEN 0 ELSE 1 END) > 0 THEN 'PARTIAL' ELSE 'COMPLETE' END AS status
    FROM cash_legs l JOIN financial_events e ON e.id = l.event_id
    WHERE CAST(l.signed_amount AS REAL) > 0 AND l.account_id IS NOT NULL
      AND e.transaction_type IN ('INTERNAL_TRANSFER','EXTERNAL_INCOME','EXTERNAL_CONTRIBUTION','ADJUSTMENT')
    GROUP BY l.account_id, l.currency ORDER BY l.account_id, l.currency`).all();
  return result.results as Array<{ accountId: string; currency: string; amount: number; status: string }>;
}
