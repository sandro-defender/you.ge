import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Application tables. The better-auth tables live in ./schema-auth.ts and are
 * GENERATED — do not hand-edit that file, regenerate it instead:
 *
 *   npm run auth:generate-schema
 */

/**
 * A snapshot of a GitHub repository, refreshed by the cron trigger.
 *
 * GitHub remains the SOURCE OF TRUTH for repository facts (activity, stars,
 * language, topics, homepage, description). Admin-managed fields sit alongside
 * that snapshot so the owner can curate copy and presentation without ever
 * hand-editing D1 rows.
 */
export const repos = sqliteTable(
	"repos",
	{
		id: integer("id").primaryKey(),
		owner: text("owner").notNull(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		homepage: text("homepage"),
		url: text("url").notNull(),
		language: text("language"),
		stars: integer("stars").notNull().default(0),
		forks: integer("forks").notNull().default(0),
		openIssues: integer("open_issues").notNull().default(0),
		topics: text("topics"),

		featuredOverride: integer("featured_override", { mode: "boolean" }),
		featured: integer("featured", { mode: "boolean" }).notNull().default(false),
		hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
		showOnHomepage: integer("show_on_homepage", { mode: "boolean" })
			.notNull()
			.default(false),
		sortOrder: integer("sort_order").notNull().default(0),
		manualPriority: integer("manual_priority").notNull().default(0),

		customTitle: text("custom_title"),
		customDescription: text("custom_description"),
		customTags: text("custom_tags"),
		customImage: text("custom_image"),
		imageAlt: text("image_alt"),
		category: text("category"),
		challenge: text("challenge"),
		solution: text("solution"),
		caseStudy: text("case_study"),

		score: integer("score").notNull().default(0),
		scoreBreakdown: text("score_breakdown"),
		githubPushedAt: integer("github_pushed_at", { mode: "timestamp_ms" }),
		githubCreatedAt: integer("github_created_at", { mode: "timestamp_ms" }),
		lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	},
	(table) => [
		index("repos_visible_sort_idx").on(table.hidden, table.featured, table.sortOrder),
		index("repos_visible_rank_idx").on(
			table.hidden,
			table.showOnHomepage,
			table.sortOrder,
			table.score,
			table.githubPushedAt,
		),
		uniqueIndex("repos_slug_idx").on(table.slug),
	],
);

/** Recent and in-progress GitHub sync runs. */
export const syncLog = sqliteTable(
	"sync_log",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		runAt: integer("run_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
		status: text("status").notNull(),
		trigger: text("trigger").notNull().default("cron"),
		repoCount: integer("repo_count").notNull().default(0),
		discoveredCount: integer("discovered_count").notNull().default(0),
		durationMs: integer("duration_ms").notNull().default(0),
		message: text("message"),
		rateLimitRemaining: integer("rate_limit_remaining"),
		rateLimitLimit: integer("rate_limit_limit"),
		rateLimitResetAt: integer("rate_limit_reset_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("sync_log_run_at_idx").on(table.runAt),
		index("sync_log_status_idx").on(table.status, table.runAt),
	],
);

export const auditLog = sqliteTable(
	"audit_log",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		actorUserId: text("actor_user_id"),
		actorName: text("actor_name"),
		actorEmail: text("actor_email"),
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id"),
		summary: text("summary").notNull(),
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	},
	(table) => [
		index("audit_log_created_at_idx").on(table.createdAt),
		index("audit_log_actor_idx").on(table.actorUserId, table.createdAt),
	],
);

export const notifications = sqliteTable(
	"notifications",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		audience: text("audience").notNull(),
		kind: text("kind").notNull(),
		level: text("level").notNull(),
		title: text("title").notNull(),
		message: text("message").notNull(),
		link: text("link"),
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
		readAt: integer("read_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("notifications_audience_idx").on(table.audience, table.readAt, table.createdAt),
	],
);
