import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { repos } from "../db/schema";
import type { PublicProject } from "../lib/types";
import type { AppContext } from "./app";

/**
 * Project (GitHub repo) read endpoints.
 *
 * Every query here is an index seek against `repos_visible_sort_idx` or
 * `repos_slug_idx`. That is deliberate: D1 Free counts rows SCANNED toward the
 * 5M/day cap, and since 2026-09-01 exceeding it hard-fails every query until
 * 00:00 UTC rather than degrading.
 */
export function createReposRouter() {
	const router = new Hono<AppContext>();

	/**
	 * Visible projects for the gated /projects page.
	 * Mounted at /api/projects, and already behind requireSession, so reaching
	 * this handler means the caller has a valid, unbanned session.
	 */
	router.get("/", async (c) => {
		const { db } = c.get("services");

		const rows = await db
			.select()
			.from(repos)
			.where(eq(repos.hidden, false))
			.orderBy(desc(repos.featured), repos.sortOrder, desc(repos.stars));

		return c.json({ projects: rows.map(toPublicProject) });
	});

	/**
	 * One project by "owner/name".
	 * `slug` contains a slash, so it must be read from the query string — a path
	 * param would need a wildcard route and invite encoding bugs.
	 */
	router.get("/by-slug", async (c) => {
		const slug = c.req.query("slug");
		if (!slug) {
			return c.json({ error: "Missing ?slug=owner/name" }, 400);
		}

		const { db } = c.get("services");
		const row = await db.query.repos.findFirst({
			where: eq(repos.slug, slug),
		});

		if (!row || row.hidden) {
			return c.json({ error: "Not found" }, 404);
		}
		return c.json({ project: toPublicProject(row) });
	});

	return router;
}

/**
 * Strip admin-only and internal columns before anything reaches the browser.
 *
 * Never return `select()` rows straight to a client: the repos table carries
 * curation state you do not want exposed, and the auth tables carry tokens.
 * An explicit projection is the guard against that class of leak.
 */
function toPublicProject(row: typeof repos.$inferSelect): PublicProject {
	return {
		id: row.id,
		owner: row.owner,
		name: row.name,
		slug: row.slug,
		url: row.url,
		homepage: row.homepage,
		language: row.language,
		stars: row.stars,
		forks: row.forks,
		openIssues: row.openIssues,
		topics: parseTopics(row.topics),
		featured: row.featured,
		description: row.customDescription ?? row.description,
		pushedAt: row.githubPushedAt?.toISOString() ?? null,
	};
}

/** `topics` is stored as JSON text because D1 has no JSON column type. */
function parseTopics(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
	} catch {
		return [];
	}
}
