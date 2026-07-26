CREATE TABLE `m0_health_probe` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`value` integer NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `m0_health_probe_value_idx` ON `m0_health_probe` (`value`);
