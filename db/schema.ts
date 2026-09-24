import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), name: text("name").notNull(), institution: text("institution").notNull(),
  accountType: text("account_type").notNull(), country: text("country"), baseCurrency: text("base_currency").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  includedInNetWorth: integer("included_in_net_worth", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(), metadata: text("metadata").notNull().default("{}"),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), symbol: text("symbol").notNull(), name: text("name").notNull(),
  assetType: text("asset_type").notNull(), exchangeOrNetwork: text("exchange_or_network"), metadata: text("metadata").notNull().default("{}"),
}, (table) => [uniqueIndex("idx_assets_identity").on(table.symbol, table.assetType, table.exchangeOrNetwork)]);

export const financialEvents = sqliteTable("financial_events", {
  id: text("id").primaryKey(), transactionDate: integer("transaction_date"), settlementDate: integer("settlement_date"),
  transactionType: text("transaction_type").notNull(), feeAmount: text("fee_amount"), feeCurrency: text("fee_currency"),
  feeTreatment: text("fee_treatment"), quotedFxRate: text("quoted_fx_rate"), quotedFxPair: text("quoted_fx_pair"),
  fxRateSource: text("fx_rate_source"), externalReference: text("external_reference"), dataSource: text("data_source").notNull(),
  reconciliationStatus: text("reconciliation_status").notNull(), dedupeKey: text("dedupe_key").notNull(), note: text("note"),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_financial_events_dedupe").on(table.dedupeKey)]);

export const cashLegs = sqliteTable("cash_legs", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => financialEvents.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id), legRole: text("leg_role").notNull(),
  ownershipScope: text("ownership_scope").notNull(), signedAmount: text("signed_amount").notNull(),
  currency: text("currency").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_cash_legs_event").on(table.eventId), index("idx_cash_legs_account").on(table.accountId)]);

export const cashBalanceSnapshots = sqliteTable("cash_balance_snapshots", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id),
  currency: text("currency").notNull(), nativeBalance: text("native_balance").notNull(), asOf: integer("as_of").notNull(),
  dataSource: text("data_source").notNull(), externalSnapshotId: text("external_snapshot_id"),
  reconciliationStatus: text("reconciliation_status").notNull(),
}, (table) => [
  uniqueIndex("idx_cash_snapshots_identity").on(table.accountId, table.currency, table.asOf, table.dataSource),
  index("idx_cash_snapshots_latest").on(table.accountId, table.asOf),
]);

export const positionSnapshots = sqliteTable("position_snapshots", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id),
  assetId: text("asset_id").notNull().references(() => assets.id), externalPositionId: text("external_position_id").notNull(),
  quantity: text("quantity").notNull(), averageCost: text("average_cost"), costCurrency: text("cost_currency"),
  currentPrice: text("current_price"), priceCurrency: text("price_currency"), marketValue: text("market_value"),
  unrealizedPnl: text("unrealized_pnl"), asOf: integer("as_of").notNull(), dataSource: text("data_source").notNull(),
  reconciliationStatus: text("reconciliation_status").notNull(), metadata: text("metadata").notNull().default("{}"),
}, (table) => [
  uniqueIndex("idx_position_snapshots_identity").on(table.accountId, table.externalPositionId, table.asOf, table.dataSource),
  index("idx_position_snapshots_latest").on(table.accountId, table.asOf),
]);

export const accountValuationSnapshots = sqliteTable("account_valuation_snapshots", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id),
  totalValue: text("total_value").notNull(), currency: text("currency").notNull(), asOf: integer("as_of").notNull(),
  dataSource: text("data_source").notNull(), externalSnapshotId: text("external_snapshot_id"),
  reconciliationStatus: text("reconciliation_status").notNull(),
}, (table) => [
  uniqueIndex("idx_account_valuations_identity").on(table.accountId, table.asOf, table.dataSource),
  index("idx_account_valuations_latest").on(table.accountId, table.asOf),
]);

export const fxRates = sqliteTable("fx_rates", {
  id: text("id").primaryKey(), baseCurrency: text("base_currency").notNull(), quoteCurrency: text("quote_currency").notNull(),
  rate: text("rate").notNull(), rateAt: integer("rate_at").notNull(), rateType: text("rate_type").notNull(), source: text("source").notNull(),
}, (table) => [uniqueIndex("idx_fx_rates_identity").on(table.baseCurrency, table.quoteCurrency, table.rateAt, table.rateType, table.source)]);
