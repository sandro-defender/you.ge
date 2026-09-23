import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { repos, syncLog } from "../db/schema";
import type { AppContext } from "./app";
import { syncGithubRepos } from "./github-sync";

/**
 * Admin-only endpoints for THIS APP's data.
 *
 * User management (list users, set role, ban, revoke sessions) is NOT here —
 * better-auth's admin plugin already exposes it at /api/auth/admin/*, and
 * reimplementing it would mean hand-rolling the exact endpoints the plugin
 * gives you for free. This router covers only what the plugin does not know
 * about: repo curation and the GitHub sync.
 *
 * Mounted behind requireSession + requireAdmin in app.ts.
 */
export function createAdminRouter() {
	const router = new Hono<AppContext>();

	/** Everything, including hidden repos and curation state. */
	router.get("/repos", async (c) => {
		const { db } = c.get("services");
		const rows = await db
			.select()
			.from(repos)
			.orderBy(desc(repos.featured), repos.sortOrder, desc(repos.stars));

		return c.json({ repos: rows });
	});

	/**
	 * Feature / hide / reorder / override the description of a repo.
	 *
	 * These four columns are the ONLY ones the cron sync never overwrites, so a
	 * curation decision survives every refresh.
	 */
	router.patch("/repos/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) {
			return c.json({ error: "Invalid repo id" }, 400);
		}

		const body = await c.req.json<{
			featured?: boolean;
			hidden?: boolean;
			sortOrder?: number;
			customDescription?: string | null;
		}>().catch(() => null);

		if (!body) {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		// Build the update from an explicit allowlist. Never spread `body` into
		// the patch — that would let a caller rewrite stars, slug, or anything
		// else the sync owns.
		const patch: Partial<typeof repos.$inferInsert> = {};
		if (typeof body.featured === "boolean") patch.featured = body.featured;
		if (typeof body.hidden === "boolean") patch.hidden = body.hidden;
		if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
		if (body.customDescription !== undefined) {
			if (typeof body.customDescription === "string" && body.customDescription.length > 200) {
				return c.json(
					{ error: "Custom description too long (max 200 characters)." },
					400,
				);
			}
			patch.customDescription =
				typeof body.customDescription === "string" ? body.customDescription : null;
		}

		if (Object.keys(patch).length === 0) {
			return c.json({ error: "No recognised fields to update" }, 400);
		}

		const { db } = c.get("services");
		const updated = await db
			.update(repos)
			.set(patch)
			.where(eq(repos.id, id))
			.returning();

		if (updated.length === 0) {
			return c.json({ error: "Repo not found" }, 404);
		}
		return c.json({ repo: updated[0] });
	});

	/**
	 * Trigger a GitHub sync on demand instead of waiting for the cron.
	 *
	 * Uses ctx.waitUntil so the HTTP response returns immediately and the sync
	 * continues in the background — a full repo fetch can outlast the time a
	 * client wants to wait, and blocking on it would look like a hung request.
	 */
	router.post("/sync", async (c) => {
		const { db } = c.get("services");
		c.executionCtx.waitUntil(syncGithubRepos(c.env, db));
		return c.json({
			started: true,
			message: "Sync running in the background. Refresh in a few seconds.",
		});
	});

	/** Recent sync outcomes — cheap observability for the cron trigger. */
	router.get("/sync-log", async (c) => {
		const { db } = c.get("services");
		const rows = await db
			.select()
			.from(syncLog)
			.orderBy(desc(syncLog.runAt))
			.limit(20);

		return c.json({ runs: rows });
	});

	return router;
}
