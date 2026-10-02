import { desc, eq, sql } from "drizzle-orm";
import { repos, syncLog } from "../db/schema";
import { scoreRepository, resolveFeaturedProjectIds } from "../lib/repo-ranking";
import type { Database } from "../lib/db";
import type { Env } from "../lib/env";
import { chunkItems } from "../lib/chunk-items";
import { notifyAdmins, writeAudit } from "./audit";
import { stringifyStringArray } from "./project-data";

const MIN_INTERVAL_MS = 60 * 60 * 1000;
const RUNNING_TIMEOUT_MS = 15 * 60 * 1000;
const PER_PAGE = 100;
const MAX_PAGES = 5;
const UPSERT_BATCH_SIZE = 5;

export type SyncTrigger = "cron" | "manual";

type SyncActor = {
	id?: string | null;
	name?: string | null;
	email?: string | null;
};

type SyncOptions = {
	trigger?: SyncTrigger;
	actor?: SyncActor | null;
	force?: boolean;
};

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

type RateLimitSnapshot = {
	remaining: number | null;
	limit: number | null;
	resetAt: Date | null;
};

type Kickoff = {
	runId: number;
	started: boolean;
	message: string;
	task: Promise<void> | null;
};

export async function kickoffGithubSync(
	env: Env,
	db: Database,
	options: SyncOptions = {},
): Promise<Kickoff> {
	const startedAt = new Date();
	const trigger = options.trigger ?? "cron";

	const running = await db
		.select({ id: syncLog.id, runAt: syncLog.runAt })
		.from(syncLog)
		.where(eq(syncLog.status, "running"))
		.orderBy(desc(syncLog.runAt))
		.limit(1);
	const activeRun = running[0];
	if (
		activeRun &&
		startedAt.getTime() - activeRun.runAt.getTime() < RUNNING_TIMEOUT_MS
	) {
		return {
			runId: activeRun.id,
			started: false,
			message: "A GitHub sync is already running.",
			task: null,
		};
	}

	const inserted = await db
		.insert(syncLog)
		.values({
			runAt: startedAt,
			status: "running",
			trigger,
			repoCount: 0,
			discoveredCount: 0,
			durationMs: 0,
			message: "Preparing GitHub sync…",
		})
		.returning({ id: syncLog.id });
	const runId = inserted[0]?.id ?? 0;

	return {
		runId,
		started: true,
		message: "GitHub sync started.",
		task: runGithubSync(env, db, runId, { ...options, trigger }),
	};
}

export async function syncGithubRepos(
	env: Env,
	db: Database,
	options: SyncOptions = {},
): Promise<number> {
	const kickoff = await kickoffGithubSync(env, db, options);
	if (kickoff.task) await kickoff.task;
	return kickoff.runId;
}

async function runGithubSync(
	env: Env,
	db: Database,
	runId: number,
	options: SyncOptions,
): Promise<void> {
	const startedAt = Date.now();
	const trigger = options.trigger ?? "cron";

	const finish = async (
		status: "ok" | "error" | "skipped",
		fields: {
			repoCount?: number;
			discoveredCount?: number;
			message?: string | null;
			rate?: RateLimitSnapshot;
		},
	) => {
		await db
			.update(syncLog)
			.set({
				status,
				repoCount: fields.repoCount ?? 0,
				discoveredCount: fields.discoveredCount ?? 0,
				durationMs: Date.now() - startedAt,
				message: fields.message ?? null,
				rateLimitRemaining: fields.rate?.remaining ?? null,
				rateLimitLimit: fields.rate?.limit ?? null,
				rateLimitResetAt: fields.rate?.resetAt ?? null,
			})
			.where(eq(syncLog.id, runId));
	};

	const pulse = async (message: string, rate?: RateLimitSnapshot) => {
		await db
			.update(syncLog)
			.set({
				message,
				durationMs: Date.now() - startedAt,
				rateLimitRemaining: rate?.remaining ?? null,
				rateLimitLimit: rate?.limit ?? null,
				rateLimitResetAt: rate?.resetAt ?? null,
			})
			.where(eq(syncLog.id, runId));
	};

	const username = env.GITHUB_USERNAME?.trim();
	if (!username) {
		await finish("skipped", {
			message: "GITHUB_USERNAME is not configured.",
		});
		return;
	}

	if (!options.force) {
		const lastRun = await db
			.select({ runAt: syncLog.runAt })
			.from(syncLog)
			.where(eq(syncLog.status, "ok"))
			.orderBy(desc(syncLog.runAt))
			.limit(1);
		const lastRunAt = lastRun[0]?.runAt?.getTime() ?? 0;
		if (Date.now() - lastRunAt < MIN_INTERVAL_MS) {
			const waitMins = Math.ceil((MIN_INTERVAL_MS - (Date.now() - lastRunAt)) / 60_000);
			await finish("skipped", {
				message: `Last successful sync was under an hour ago; retry in ~${waitMins}m.`,
			});
			return;
		}
	}

	let fetched: GitHubRepo[] = [];
	let rate: RateLimitSnapshot = { remaining: null, limit: null, resetAt: null };

	try {
		await pulse("Fetching repositories from GitHub…");
		const result = await fetchRepos(username, env.GITHUB_TOKEN, (message, latestRate) =>
			pulse(message, latestRate),
		);
		fetched = result.repos;
		rate = result.rate;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[github-sync] fetch failed:", message);
		await finish("error", { message: message.slice(0, 500), rate });
		await notifyAdmins(db, {
			kind: "sync-failure",
			level: "error",
			title: "GitHub sync failed",
			message: message.slice(0, 220),
			link: "/admin",
			metadata: { runId, trigger },
		});
		return;
	}

	const active = uniqueById(fetched.filter((repo) => repo.archived !== true));
	if (active.length === 0) {
		await finish("ok", {
			repoCount: 0,
			discoveredCount: 0,
			message:
				fetched.length === 0
					? "GitHub returned no public repositories."
					: "GitHub returned only archived repositories.",
			rate,
		});
		return;
	}

	const existing = await db
		.select({
			id: repos.id,
			slug: repos.slug,
			manualPriority: repos.manualPriority,
		})
		.from(repos);
	const ownerBySlug = new Map(existing.map((row) => [row.slug, row.id]));
	const priorityById = new Map(existing.map((row) => [row.id, row.manualPriority]));
	const existingIds = new Set(existing.map((row) => row.id));

	const conflicts = active.filter((repo) => {
		const owner = ownerBySlug.get(repo.full_name);
		return owner !== undefined && owner !== repo.id;
	});
	const safeRepos = active.filter((repo) => !conflicts.includes(repo));
	if (safeRepos.length === 0) {
		await finish("error", {
			message: `Skipped ${conflicts.length} repositories: renamed slug already exists.`,
			rate,
		});
		return;
	}

	const discovered = safeRepos.filter((repo) => !existingIds.has(repo.id));

	try {
		await pulse(`Writing ${safeRepos.length} repositories to D1…`, rate);
		const now = new Date();
		for (const batch of chunkItems(safeRepos, UPSERT_BATCH_SIZE)) {
			await db
				.insert(repos)
				.values(
					batch.map((repo) => {
						const breakdown = scoreRepository({
							description: repo.description,
							homepage: normaliseHomepage(repo.homepage),
							language: repo.language,
							stars: repo.stargazers_count ?? 0,
							topics: repo.topics ?? [],
							githubPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
							manualPriority: priorityById.get(repo.id) ?? 0,
						});
						return {
							id: repo.id,
							owner: repo.owner?.login ?? username,
							name: repo.name,
							slug: repo.full_name,
							description: repo.description,
							homepage: normaliseHomepage(repo.homepage),
							url: repo.html_url,
							language: repo.language,
							stars: repo.stargazers_count ?? 0,
							forks: repo.forks_count ?? 0,
							openIssues: repo.open_issues_count ?? 0,
							topics: stringifyStringArray(repo.topics ?? []),
							score: breakdown.total,
							scoreBreakdown: JSON.stringify(breakdown),
							githubPushedAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
							githubCreatedAt: repo.created_at ? new Date(repo.created_at) : null,
							lastSyncedAt: now,
						};
					}),
				)
				.onConflictDoUpdate({
					target: repos.id,
					set: {
						owner: sql`excluded.owner`,
						name: sql`excluded.name`,
						slug: sql`excluded.slug`,
						description: sql`excluded.description`,
						homepage: sql`excluded.homepage`,
						url: sql`excluded.url`,
						language: sql`excluded.language`,
						stars: sql`excluded.stars`,
						forks: sql`excluded.forks`,
						openIssues: sql`excluded.open_issues`,
						topics: sql`excluded.topics`,
						score: sql`excluded.score`,
						scoreBreakdown: sql`excluded.score_breakdown`,
						githubPushedAt: sql`excluded.github_pushed_at`,
						githubCreatedAt: sql`excluded.github_created_at`,
						lastSyncedAt: sql`excluded.last_synced_at`,
					},
				});
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[github-sync] upsert failed:", message);
		await finish("error", {
			repoCount: safeRepos.length,
			discoveredCount: discovered.length,
			message: message.slice(0, 500),
			rate,
		});
		await notifyAdmins(db, {
			kind: "sync-failure",
			level: "error",
			title: "GitHub sync failed while saving",
			message: message.slice(0, 220),
			link: "/admin",
			metadata: { runId, trigger },
		});
		return;
	}

	await refreshFeaturedFlags(db);

	const conflictSuffix = conflicts.length > 0 ? ` Skipped ${conflicts.length} slug conflict(s).` : "";
	const discoverySuffix =
		discovered.length > 0 ? ` Discovered ${discovered.length} new repositories.` : "";
	const rateSuffix =
		rate.remaining !== null && rate.limit !== null
			? ` Rate limit: ${rate.remaining}/${rate.limit} remaining.`
			: "";
	const message = `Synced ${safeRepos.length} repositories for ${username}.${discoverySuffix}${conflictSuffix}${rateSuffix}`.trim();

	await finish("ok", {
		repoCount: safeRepos.length,
		discoveredCount: discovered.length,
		message,
		rate,
	});

	if (options.actor?.id) {
		await writeAudit(db, {
			action: "sync.completed",
			entityType: "sync",
			entityId: String(runId),
			summary: `${options.actor.email ?? options.actor.name ?? "An admin"} ran a manual GitHub sync.`,
			metadata: { repoCount: safeRepos.length, discoveredCount: discovered.length },
			actor: options.actor,
		});
	}

	if (discovered.length > 0) {
		await notifyAdmins(db, {
			kind: "repo-discovery",
			level: "success",
			title: `${discovered.length} new repos discovered`,
			message: discovered.slice(0, 4).map((repo) => repo.name).join(", "),
			link: "/admin/repos",
			metadata: { repos: discovered.map((repo) => repo.full_name) },
		});
	}
}

export async function refreshFeaturedFlags(db: Database): Promise<void> {
	const rows = await db
		.select({
			id: repos.id,
			hidden: repos.hidden,
			featuredOverride: repos.featuredOverride,
			score: repos.score,
			sortOrder: repos.sortOrder,
			stars: repos.stars,
			githubPushedAt: repos.githubPushedAt,
			featured: repos.featured,
		})
		.from(repos);
	const featuredIds = resolveFeaturedProjectIds(rows);
	for (const row of rows) {
		const next = featuredIds.has(row.id);
		if (row.featured === next) continue;
		await db.update(repos).set({ featured: next }).where(eq(repos.id, row.id));
	}
}

async function fetchRepos(
	username: string,
	token: string | undefined,
	onProgress?: (message: string, rate: RateLimitSnapshot) => Promise<void> | void,
): Promise<{ repos: GitHubRepo[]; rate: RateLimitSnapshot }> {
	const collected: GitHubRepo[] = [];
	let latestRate: RateLimitSnapshot = { remaining: null, limit: null, resetAt: null };

	for (let page = 1; page <= MAX_PAGES; page += 1) {
		const url =
			`https://api.github.com/users/${encodeURIComponent(username)}/repos` +
			`?per_page=${PER_PAGE}&sort=pushed&direction=desc&type=owner&page=${page}`;

		const res = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "you-ge-main-worker",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
		});

		latestRate = extractRateLimit(res.headers);
		await onProgress?.(`Fetching GitHub page ${page}…`, latestRate);

		if (!res.ok) {
			const details: string[] = [];
			if (latestRate.remaining !== null) details.push(`rate limit remaining: ${latestRate.remaining}`);
			if (latestRate.resetAt) details.push(`resets ${latestRate.resetAt.toISOString()}`);
			const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
			throw new Error(`GitHub API ${res.status} ${res.statusText}${suffix}`);
		}

		const data: unknown = await res.json();
		if (!Array.isArray(data)) {
			throw new Error("GitHub API returned a non-array payload");
		}

		const pageItems = data as GitHubRepo[];
		collected.push(...pageItems);
		if (pageItems.length < PER_PAGE) break;
	}

	return { repos: collected, rate: latestRate };
}

function extractRateLimit(headers: Headers): RateLimitSnapshot {
	const remaining = headers.get("x-ratelimit-remaining");
	const limit = headers.get("x-ratelimit-limit");
	const reset = headers.get("x-ratelimit-reset");
	return {
		remaining: remaining === null ? null : Number(remaining),
		limit: limit === null ? null : Number(limit),
		resetAt: reset === null ? null : new Date(Number(reset) * 1000),
	};
}

function uniqueById(items: GitHubRepo[]): GitHubRepo[] {
	const seen = new Set<number>();
	return items.filter((item) => {
		if (seen.has(item.id)) return false;
		seen.add(item.id);
		return true;
	});
}

function normaliseHomepage(value: string | null): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
	return `https://${trimmed}`;
}
