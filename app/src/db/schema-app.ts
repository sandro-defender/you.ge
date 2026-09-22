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
 * WHY THIS TABLE EXISTS
 *   GitHub allows 60 unauthenticated requests/hour/IP and 5,000/hour for a PAT.
 *   Fetching repos during a page request would break the site within an hour of
 *   real traffic. So `scheduled()` pulls them every 6 hours into D1, and pages
 *   read only this table. Scheduled invocations are free and do not count
 *   against the 100k requests/day Workers Free allowance.
 *
 * QUOTA NOTE (Workers Free: 5M rows read/day, and "rows read" means rows
 * SCANNED, not rows returned)
 *   The homepage reads 1 row via `home_slug_idx`; the projects page reads the
 *   visible subset via `visible_sort_idx`. Both are index seeks. A query that
 *   ignores these indexes and scans the table would still be small at portfolio
 *   scale, but the indexes are what keep it that way as the table grows.
 */
export const repos = sqliteTable(
	"repos",
	{
		id: integer("id").primaryKey(), // GitHub's own repo id — stable and unique
		owner: text("owner").notNull(),
		name: text("name").notNull(),
		slug: text("slug").notNull(), // "owner/name"
		description: text("description"),
		homepage: text("homepage"),
		url: text("url").notNull(),
		language: text("language"),
		stars: integer("stars").notNull().default(0),
		forks: integer("forks").notNull().default(0),
		openIssues: integer("open_issues").notNull().default(0),
		topics: text("topics"), // JSON array as text — D1 has no JSON column type

		/**
		 * Curation flags. These are set by an admin, NOT by the GitHub sync —
		 * the sync never overwrites them, so you can feature or hide a repo and
		 * keep that choice across every refresh.
		 */
		featured: integer("featured", { mode: "boolean" }).notNull().default(false),
		hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
		sortOrder: integer("sort_order").notNull().default(0),

		/**
		 * A hand-written description shown instead of GitHub's. This is where the
		 * "description" part of your requirement lives — GitHub's own blurbs are
		 * usually too terse for a portfolio.
		 */
		customDescription: text("custom_description"),

		githubPushedAt: integer("github_pushed_at", { mode: "timestamp_ms" }),
		githubCreatedAt: integer("github_created_at", { mode: "timestamp_ms" }),
		lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
	},
	(table) => [
		// The projects page: WHERE hidden = 0 ORDER BY featured DESC, sort_order.
		// This composite index turns that into an index seek instead of a scan —
		// which matters because D1 Free counts rows SCANNED against the 5M/day cap.
		index("repos_visible_sort_idx").on(
			table.hidden,
			table.featured,
			table.sortOrder,
		),
		// Single-repo lookup by slug, and the key the cron sync upserts on.
		uniqueIndex("repos_slug_idx").on(table.slug),
	],
);

/**
 * Audit log of cron syncs. One row per run, so you can see from the admin panel
 * whether the sync is alive and how many repos it touched — the cheapest
 * possible observability, and it costs one write every 6 hours.
 */
export const syncLog = sqliteTable(
	"sync_log",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		runAt: integer("run_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
		status: text("status").notNull(), // 'ok' | 'error' | 'skipped'
		repoCount: integer("repo_count").notNull().default(0),
		durationMs: integer("duration_ms").notNull().default(0),
		message: text("message"),
	},
	(table) => [index("sync_log_run_at_idx").on(table.runAt)],
);
