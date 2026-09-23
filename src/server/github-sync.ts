import { desc, eq, sql } from "drizzle-orm";
import { repos, syncLog } from "../db/schema";
import type { Database } from "../lib/db";
import type { Env } from "../lib/env";

/**
 * GitHub → D1 synchronisation.
 *
 * ── WHY THIS IS A CRON JOB AND NOT A PAGE REQUEST ───────────────────────────
 * GitHub allows 60 unauthenticated requests/hour/IP and 5,000/hour for a PAT.
 * Cloudflare's egress IPs are shared, so the unauthenticated budget is
 * effectively unusable from a Worker. Fetching repos during a page request
 * would therefore break the portfolio within an hour of real traffic.
 *
 * Instead `scheduled()` runs every 6 hours (see wrangler.jsonc "triggers"),
 * writes the repos into D1, and every page reads only D1. Scheduled
 * invocations are FREE and do not count toward the 100k requests/day Workers
 * Free allowance. Cron triggers are Workers-only — Cloudflare Pages cannot do
 * this at all, which is a concrete reason this app is on Workers.
 *
 * ── D1 WRITE BUDGET ─────────────────────────────────────────────────────────
 * Workers Free allows 100k rows written/day, hard-failing past that. One sync
 * writes ~1 row per repo plus 1 sync_log row. At 100 repos x 4 runs/day that is
 * ~400 writes/day — 0.4% of the budget. The upsert below is a SINGLE multi-row
 * statement, not a loop of inserts, which keeps that number down.
 */

/** Skip a sync if one succeeded this recently. Guards against hammering GitHub
 *  when the admin "sync now" button is clicked repeatedly. */
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const PER_PAGE = 100; // GitHub's maximum

type GitHubRepo = {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	homepage: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	archived?: boolean;
	topics?: string[];
	pushed_at: string | null;
	created_at: string | null;
	owner?: { login?: string };
};

export async function syncGithubRepos(env: Env, db: Database): Promise<void> {
	const startedAt = Date.now();

	const log = async (
		status: "ok" | "error" | "skipped",
		repoCount: number,
		message?: string,
	) => {
		// Best-effort: a failure to write the audit row must not mask the real
		// outcome of the sync.
		try {
			await db.insert(syncLog).values({
				runAt: new Date(startedAt),
				status,
				repoCount,
				durationMs: Date.now() - startedAt,
				message: message ?? null,
			});
		} catch {
			/* ignore */
		}
	};

	const username = env.GITHUB_USERNAME?.trim();
	if (!username) {
		console.warn("[github-sync] GITHUB_USERNAME not set — skipping.");
		await log("skipped", 0, "GITHUB_USERNAME is not configured");
		return;
	}

	// ── Throttle ────────────────────────────────────────────────────────────
	const lastRun = await db
		.select({ runAt: syncLog.runAt })
		.from(syncLog)
		.where(eq(syncLog.status, "ok"))
		.orderBy(desc(syncLog.runAt))
		.limit(1);

	const lastRunAt = lastRun[0]?.runAt?.getTime() ?? 0;
	if (Date.now() - lastRunAt < MIN_INTERVAL_MS) {
		const waitMins = Math.ceil(
			(MIN_INTERVAL_MS - (Date.now() - lastRunAt)) / 60_000,
		);
		await log("skipped", 0, `Last successful sync was under an hour ago; retry in ~${waitMins}m`);
		return;
	}

	// ── Fetch ───────────────────────────────────────────────────────────────
	let fetched: GitHubRepo[];
	try {
		fetched = await fetchRepos(username, env.GITHUB_TOKEN);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[github-sync] fetch failed:", message);
		await log("error", 0, message.slice(0, 500));
		return;
	}

	// Archived repositories are not portfolio projects. Filtering them here also
	// prevents an archive/unarchive cycle from changing curation unexpectedly.
	const active = fetched.filter((repo) => repo.archived !== true);
	if (active.length === 0) {
		await log("ok", 0, fetched.length === 0 ? "GitHub returned no public repos" : "GitHub returned only archived repos");
		return;
	}

	// A rename changes the slug but not GitHub's stable numeric id. Upsert by id
	// so the row follows a rename instead of creating a duplicate. If the new
	// slug is already owned by another row, skip that one repo rather than
	// aborting the whole batch (the conflict remains visible in sync_log).
	const existing = await db.select({ id: repos.id, slug: repos.slug }).from(repos);
	const ownerBySlug = new Map(existing.map((row) => [row.slug, row.id]));
	const conflicts = active.filter((repo) => {
		const owner = ownerBySlug.get(repo.full_name);
		return owner !== undefined && owner !== repo.id;
	});
	const safeRepos = active.filter((repo) => !conflicts.includes(repo));
	if (conflicts.length > 0) {
		console.warn(`[github-sync] skipped ${conflicts.length} renamed repo slug conflict(s)`);
	}
	if (safeRepos.length === 0) {
		await log("error", 0, `Skipped ${conflicts.length} repo(s): renamed slug already exists`);
		return;
	}

	// ── Upsert ──────────────────────────────────────────────────────────────
	// ONE multi-row statement, verified to emit:
	//   insert into "repos" (...) values (?,...), (?,...)
	//   on conflict ("repos"."slug") do update set ... where ...
	try {
		const now = new Date();

		await db
			.insert(repos)
			.values(
				safeRepos.map((repo) => ({
					id: repo.id,
					owner: repo.owner?.login ?? username,
					name: repo.name,
					slug: repo.full_name,
					description: repo.description,
					homepage: repo.homepage,
					url: repo.html_url,
					language: repo.language,
					stars: repo.stargazers_count ?? 0,
					forks: repo.forks_count ?? 0,
					openIssues: repo.open_issues_count ?? 0,
					topics: JSON.stringify(repo.topics ?? []),
					githubPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
					githubCreatedAt: repo.created_at ? new Date(repo.created_at) : null,
					lastSyncedAt: now,
					//featured / hidden / sortOrder / customDescription are
					// intentionally absent: they fall back to their column
					// defaults on first insert and are never touched on update.
				})),
			)
			.onConflictDoUpdate({
				target: repos.id,
				set: {
					// Only GitHub-owned columns. Curation columns are excluded so
					// that featuring, hiding, reordering, or overriding a
					// description survives every sync forever.
					owner: sql`excluded.owner`,
					name: sql`excluded.name`,
					description: sql`excluded.description`,
					homepage: sql`excluded.homepage`,
					url: sql`excluded.url`,
					language: sql`excluded.language`,
					stars: sql`excluded.stars`,
					forks: sql`excluded.forks`,
					openIssues: sql`excluded.open_issues`,
					topics: sql`excluded.topics`,
					githubPushedAt: sql`excluded.github_pushed_at`,
					githubCreatedAt: sql`excluded.github_created_at`,
					lastSyncedAt: sql`excluded.last_synced_at`,
				},
			});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[github-sync] upsert failed:", message);
		await log("error", safeRepos.length, message.slice(0, 500));
		return;
	}

	const suffix = conflicts.length > 0 ? `; skipped ${conflicts.length} slug conflict(s)` : "";
	await log("ok", safeRepos.length, `Synced ${safeRepos.length} repos for ${username}${suffix}`);
	console.log(`[github-sync] synced ${safeRepos.length} repos in ${Date.now() - startedAt}ms`);
}

/**
 * Fetch public repos, newest activity first.
 *
 * Only the first page (100 repos) is fetched — ample for a portfolio. If you
 * ever exceed it, this is the function to add pagination to; `Link` header
 * parsing is the standard approach.
 */
async function fetchRepos(
	username: string,
	token: string | undefined,
): Promise<GitHubRepo[]> {
	const url =
		`https://api.github.com/users/${encodeURIComponent(username)}/repos` +
		`?per_page=${PER_PAGE}&sort=pushed&direction=desc&type=owner`;

	const res = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "you-ge-main-worker",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	});

	if (!res.ok) {
		// GitHub always sends these. Surfacing them in the message is what makes
		// a 403 diagnosable from the sync log alone, instead of guessing whether
		// it was a bad token or an exhausted rate limit.
		const details: string[] = [];
		const remaining = res.headers.get("x-ratelimit-remaining");
		const reset = res.headers.get("x-ratelimit-reset");
		if (remaining !== null) details.push(`rate limit remaining: ${remaining}`);
		if (reset !== null) {
			details.push(`resets ${new Date(Number(reset) * 1000).toISOString()}`);
		}

		const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
		throw new Error(`GitHub API ${res.status} ${res.statusText}${suffix}`);
	}

	const data: unknown = await res.json();
	if (!Array.isArray(data)) {
		throw new Error("GitHub API returned a non-array payload");
	}
	return data as GitHubRepo[];
}
