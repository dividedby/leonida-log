PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`gate_hint` text,
	`category_hint` text,
	`mission_hint` text,
	`change_kind` text,
	`content_hash` text,
	`diff_summary` text,
	`raw_extract` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidates_status_values" CHECK("__new_candidates"."status" in ('new', 'promoted', 'rejected')),
	CONSTRAINT "candidates_change_kind_values" CHECK("__new_candidates"."change_kind" is null or "__new_candidates"."change_kind" in ('new', 'modified'))
);
--> statement-breakpoint
INSERT INTO `__new_candidates`("id", "source_id", "gate_hint", "category_hint", "raw_extract", "status", "created_at", "reviewed_at") SELECT "id", "source_id", "gate_hint", "category_hint", "raw_extract", "status", "created_at", "reviewed_at" FROM `candidates`;--> statement-breakpoint
DROP TABLE `candidates`;--> statement-breakpoint
ALTER TABLE `__new_candidates` RENAME TO `candidates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `candidates_status` ON `candidates` (`status`);--> statement-breakpoint
ALTER TABLE `sources` ADD `source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `etag` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `last_modified` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `remote_modified` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `http_status` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `checked_at` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `changed_at` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `extract` text;--> statement-breakpoint
CREATE INDEX `sources_source` ON `sources` (`source`);