CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`tint` text NOT NULL,
	`parent_id` text,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `locations_household_idx` ON `locations` (`household_id`);
--> statement-breakpoint
CREATE INDEX `locations_parent_idx` ON `locations` (`household_id`,`parent_id`);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`allergens` text NOT NULL,
	`is_staple` integer NOT NULL,
	`default_form_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingredients_name_idx` ON `ingredients` (`name`);
--> statement-breakpoint
CREATE TABLE `ingredient_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`form` text NOT NULL,
	`dim` text NOT NULL,
	`density_g_per_ml` real,
	`grams_per_count` real,
	`uncertainty_pct` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingredient_forms_ingredient_idx` ON `ingredient_forms` (`ingredient_id`);
--> statement-breakpoint
CREATE TABLE `conversion_edges` (
	`from_form_id` text NOT NULL,
	`to_form_id` text NOT NULL,
	`factor` real NOT NULL,
	`uncertainty_pct` real NOT NULL,
	`source` text NOT NULL,
	`one_way` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`from_form_id`, `to_form_id`)
);
--> statement-breakpoint
CREATE INDEX `conversion_edges_to_idx` ON `conversion_edges` (`to_form_id`);
--> statement-breakpoint
CREATE TABLE `package_specs` (
	`form_id` text NOT NULL,
	`label` text NOT NULL,
	`net_g` real NOT NULL,
	`drained_g` real,
	PRIMARY KEY(`form_id`, `label`)
);
--> statement-breakpoint
CREATE INDEX `package_specs_form_idx` ON `package_specs` (`form_id`);
--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`household_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`form_id` text NOT NULL,
	`location_id` text,
	`qty_base` real NOT NULL,
	`dim` text NOT NULL,
	`par_level_base` real NOT NULL,
	`low_threshold_pct` real NOT NULL,
	`last_verified_at` text,
	`unverified_cook_count` integer DEFAULT 0 NOT NULL,
	`opened_at` text,
	`expires_at` text,
	`updated_at` text NOT NULL,
	`watermark_cursor` text,
	`last_absolute_cursor` text,
	`is_negative` integer DEFAULT false NOT NULL,
	`conflict` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`household_id`, `ingredient_id`, `form_id`)
);
--> statement-breakpoint
CREATE INDEX `pantry_items_location_idx` ON `pantry_items` (`household_id`,`location_id`);
--> statement-breakpoint
CREATE INDEX `pantry_items_ingredient_idx` ON `pantry_items` (`household_id`,`ingredient_id`);
--> statement-breakpoint
CREATE TABLE `pantry_txns` (
	`id` text PRIMARY KEY NOT NULL,
	`client_txn_id` text NOT NULL,
	`household_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`form_id` text NOT NULL,
	`kind` text NOT NULL,
	`delta_base` real,
	`target_base` real,
	`basis_cursor` text,
	`reason` text NOT NULL,
	`ref_id` text,
	`unit_price` real,
	`occurred_at` text NOT NULL,
	`accepted_at` text,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_txn_household_client_uidx` ON `pantry_txns` (`household_id`,`client_txn_id`);
--> statement-breakpoint
CREATE INDEX `pantry_txn_household_ingredient_occurred_idx` ON `pantry_txns` (`household_id`,`ingredient_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `pantry_txn_household_accepted_idx` ON `pantry_txns` (`household_id`,`accepted_at`);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text,
	`title` text NOT NULL,
	`servings` real NOT NULL,
	`yield_note` text,
	`prep_min` integer,
	`cook_min` integer,
	`author_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`forked_from` text,
	`tags` text,
	`image_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipes_household_idx` ON `recipes` (`household_id`);
--> statement-breakpoint
CREATE INDEX `recipes_title_idx` ON `recipes` (`title`);
--> statement-breakpoint
CREATE TABLE `recipe_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`ingredient_id` text,
	`form_id` text,
	`raw_text` text NOT NULL,
	`qty` real,
	`unit` text,
	`optional` integer DEFAULT false NOT NULL,
	`group_id` text,
	`substitutes` text,
	`unknown_allergens` integer DEFAULT false NOT NULL,
	`non_quantified` integer DEFAULT false NOT NULL,
	`qty_high` real,
	`qty_low` real,
	`is_range` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_lines_recipe_idx` ON `recipe_lines` (`recipe_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`text` text NOT NULL,
	`duration_sec` integer,
	`timer_label` text
);
--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_idx` ON `recipe_steps` (`recipe_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `grocery_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`shopping_trip_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `grocery_lists_household_idx` ON `grocery_lists` (`household_id`);
--> statement-breakpoint
CREATE INDEX `grocery_lists_trip_idx` ON `grocery_lists` (`shopping_trip_id`);
--> statement-breakpoint
CREATE TABLE `grocery_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`shopping_trip_id` text NOT NULL,
	`ingredient_id` text,
	`form_id` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`qty_base` real,
	`dim` text,
	`display_qty` text NOT NULL,
	`sources` text,
	`recipe_ids` text,
	`checked` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `grocery_list_items_list_idx` ON `grocery_list_items` (`list_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `grocery_list_items_trip_idx` ON `grocery_list_items` (`shopping_trip_id`);
--> statement-breakpoint
CREATE TABLE `user_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`alias` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_aliases_household_alias_uidx` ON `user_aliases` (`household_id`,`alias`);
--> statement-breakpoint
CREATE INDEX `user_aliases_ingredient_idx` ON `user_aliases` (`ingredient_id`);
