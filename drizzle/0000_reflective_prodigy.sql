CREATE TABLE `account_valuation_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`total_value` text NOT NULL,
	`currency` text NOT NULL,
	`as_of` integer NOT NULL,
	`data_source` text NOT NULL,
	`external_snapshot_id` text,
	`reconciliation_status` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_valuations_identity` ON `account_valuation_snapshots` (`account_id`,`as_of`,`data_source`);--> statement-breakpoint
CREATE INDEX `idx_account_valuations_latest` ON `account_valuation_snapshots` (`account_id`,`as_of`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`account_type` text NOT NULL,
	`country` text,
	`base_currency` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`included_in_net_worth` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`asset_type` text NOT NULL,
	`exchange_or_network` text,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assets_identity` ON `assets` (`symbol`,`asset_type`,`exchange_or_network`);--> statement-breakpoint
CREATE TABLE `cash_balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`currency` text NOT NULL,
	`native_balance` text NOT NULL,
	`as_of` integer NOT NULL,
	`data_source` text NOT NULL,
	`external_snapshot_id` text,
	`reconciliation_status` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cash_snapshots_identity` ON `cash_balance_snapshots` (`account_id`,`currency`,`as_of`,`data_source`);--> statement-breakpoint
CREATE INDEX `idx_cash_snapshots_latest` ON `cash_balance_snapshots` (`account_id`,`as_of`);--> statement-breakpoint
CREATE TABLE `cash_legs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`account_id` text,
	`leg_role` text NOT NULL,
	`ownership_scope` text NOT NULL,
	`signed_amount` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `financial_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cash_legs_event` ON `cash_legs` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_cash_legs_account` ON `cash_legs` (`account_id`);--> statement-breakpoint
CREATE TABLE `financial_events` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_date` integer,
	`settlement_date` integer,
	`transaction_type` text NOT NULL,
	`fee_amount` text,
	`fee_currency` text,
	`fee_treatment` text,
	`quoted_fx_rate` text,
	`quoted_fx_pair` text,
	`fx_rate_source` text,
	`external_reference` text,
	`data_source` text NOT NULL,
	`reconciliation_status` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_financial_events_dedupe` ON `financial_events` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`base_currency` text NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` text NOT NULL,
	`rate_at` integer NOT NULL,
	`rate_type` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fx_rates_identity` ON `fx_rates` (`base_currency`,`quote_currency`,`rate_at`,`rate_type`,`source`);--> statement-breakpoint
CREATE TABLE `position_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`external_position_id` text NOT NULL,
	`quantity` text NOT NULL,
	`average_cost` text,
	`cost_currency` text,
	`current_price` text,
	`price_currency` text,
	`market_value` text,
	`unrealized_pnl` text,
	`as_of` integer NOT NULL,
	`data_source` text NOT NULL,
	`reconciliation_status` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_position_snapshots_identity` ON `position_snapshots` (`account_id`,`external_position_id`,`as_of`,`data_source`);--> statement-breakpoint
CREATE INDEX `idx_position_snapshots_latest` ON `position_snapshots` (`account_id`,`as_of`);