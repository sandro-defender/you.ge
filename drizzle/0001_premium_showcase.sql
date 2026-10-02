ALTER TABLE `repos` ADD `featured_override` integer;
--> statement-breakpoint
ALTER TABLE `repos` ADD `show_on_homepage` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `repos` ADD `manual_priority` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `repos` ADD `custom_title` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `custom_tags` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `custom_image` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `image_alt` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `category` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `challenge` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `solution` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `case_study` text;
--> statement-breakpoint
ALTER TABLE `repos` ADD `score` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `repos` ADD `score_breakdown` text;
--> statement-breakpoint
CREATE INDEX `repos_visible_rank_idx` ON `repos` (`hidden`,`show_on_homepage`,`sort_order`,`score`,`github_pushed_at`);
--> statement-breakpoint
ALTER TABLE `sync_log` ADD `trigger` text DEFAULT 'cron' NOT NULL;
--> statement-breakpoint
ALTER TABLE `sync_log` ADD `discovered_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `sync_log` ADD `rate_limit_remaining` integer;
--> statement-breakpoint
ALTER TABLE `sync_log` ADD `rate_limit_limit` integer;
--> statement-breakpoint
ALTER TABLE `sync_log` ADD `rate_limit_reset_at` integer;
--> statement-breakpoint
CREATE INDEX `sync_log_status_idx` ON `sync_log` (`status`,`run_at`);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text,
	`actor_name` text,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`audience` text NOT NULL,
	`kind` text NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `notifications_audience_idx` ON `notifications` (`audience`,`read_at`,`created_at`);
