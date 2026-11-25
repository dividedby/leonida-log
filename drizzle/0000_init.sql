CREATE TABLE `candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`gate_hint` text,
	`category_hint` text,
	`raw_extract` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidates_status_values" CHECK("candidates"."status" in ('new', 'promoted', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `candidates_status` ON `candidates` (`status`);--> statement-breakpoint
CREATE TABLE `item_checks` (
	`item_id` text PRIMARY KEY NOT NULL,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_mission` text,
	`spoiler_mode` text DEFAULT 'safe' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "progress_single_row" CHECK("progress"."id" = 1),
	CONSTRAINT "progress_spoiler_mode" CHECK("progress"."spoiler_mode" in ('safe', 'open')),
	CONSTRAINT "progress_theme" CHECK("progress"."theme" in ('system', 'light', 'dark'))
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`host` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);--> statement-breakpoint
CREATE TABLE `stat_levels` (
	`character` text NOT NULL,
	`stat` text NOT NULL,
	`level` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`character`, `stat`),
	CONSTRAINT "stat_levels_character" CHECK("stat_levels"."character" in ('jason', 'lucia')),
	CONSTRAINT "stat_levels_stat" CHECK("stat_levels"."stat" in ('strength', 'cardio', 'focus')),
	CONSTRAINT "stat_levels_level" CHECK("stat_levels"."level" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character` text NOT NULL,
	`stat` text NOT NULL,
	`at` integer NOT NULL,
	CONSTRAINT "workouts_character" CHECK("workouts"."character" in ('jason', 'lucia')),
	CONSTRAINT "workouts_stat" CHECK("workouts"."stat" in ('strength', 'cardio', 'focus'))
);
--> statement-breakpoint
CREATE INDEX `workouts_character_stat_at` ON `workouts` (`character`,`stat`,`at`);