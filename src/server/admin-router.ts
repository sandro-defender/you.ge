import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { notifications, repos, session, syncLog, user } from "../db/schema";
import { canChangeAdminState } from "../lib/admin-guards";
import type { Database } from "../lib/db";
import type {
	AdminOverview,
	AdminUser,
	AuditEntry,
	NotificationItem,
	SyncRun,
} from "../lib/types";
import type { AppContext } from "./app";
import { kickoffGithubSync, refreshFeaturedFlags } from "./github-sync";
import { notificationFeed, notifyAdmins, notifyUser, recentAuditEntries, writeAudit } from "./audit";
import { buildAdminRepos, stringifyStringArray } from "./project-data";

const COPY_LIMITS = {
	title: 96,
	description: 280,
	image: 500,
	alt: 140,
	category: 40,
	challenge: 800,
	solution: 1200,
	caseStudy: 5000,
	tags: 12,
};

export function createAdminRouter() {
	const router = new Hono<AppContext>();

	router.get("/overview", async (c) => {
		const { db } = c.get("services");
		const [repoRows, userRows, sessionRows, syncRows, auditRows, notices] = await Promise.all([
			db.select().from(repos),
			db.select().from(user),
			db.select().from(session),
			db.select().from(syncLog).orderBy(desc(syncLog.runAt)).limit(10),
			recentAuditEntries(db, 8),
			notificationFeed(db, { audience: ["admin"], limit: 8 }),
		]);

		const now = Date.now();
		const adminRepos = buildAdminRepos(repoRows);
		const activeUsers = new Set(
			sessionRows.filter((row) => row.expiresAt.getTime() > now).map((row) => row.userId),
		).size;
		const pendingActions =
			userRows.filter((row) => !row.banned && (row.role ?? "user") === "user").length +
			notices.items.filter((item) => item.readAt === null && item.level === "error").length;

		const payload: AdminOverview = {
			totals: {
				repositories: adminRepos.length,
				featured: adminRepos.filter((repo) => repo.featured).length,
				hidden: adminRepos.filter((repo) => repo.hidden).length,
				activeUsers,
				pendingActions,
				failedSyncs: syncRows.filter((row) => row.status === "error").length,
				unreadNotifications: notices.unreadCount,
			},
			lastSync: syncRows[0] ? toSyncRun(syncRows[0]) : null,
			recentSyncs: syncRows.map(toSyncRun),
			recentAudit: auditRows,
			recentNotifications: notices.items,
		};

		return c.json(payload);
	});

	router.get("/repos", async (c) => {
		const { db } = c.get("services");
		const rows = await db.select().from(repos);
		return c.json({ repos: buildAdminRepos(rows) });
	});

	router.patch("/repos/:id", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid repo id" }, 400);

		const body = await c.req
			.json<{
				featuredOverride?: boolean | null;
				hidden?: boolean;
				showOnHomepage?: boolean;
				sortOrder?: number;
				manualPriority?: number;
				customTitle?: string | null;
				customDescription?: string | null;
				customTags?: string[] | null;
				customImage?: string | null;
				imageAlt?: string | null;
				category?: string | null;
				challenge?: string | null;
				solution?: string | null;
				caseStudy?: string | null;
			}>()
			.catch(() => null);
		if (!body) return c.json({ error: "Invalid JSON body" }, 400);

		const patch: Partial<typeof repos.$inferInsert> = {};
		if (body.featuredOverride === null || typeof body.featuredOverride === "boolean") {
			patch.featuredOverride = body.featuredOverride;
		}
		if (typeof body.hidden === "boolean") patch.hidden = body.hidden;
		if (typeof body.showOnHomepage === "boolean") patch.showOnHomepage = body.showOnHomepage;
		if (typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder)) patch.sortOrder = body.sortOrder;
		if (typeof body.manualPriority === "number" && Number.isInteger(body.manualPriority)) {
			patch.manualPriority = clamp(body.manualPriority, -3, 5);
		}
		try {
			applyNullableCopy(patch, "customTitle", body.customTitle, COPY_LIMITS.title);
			applyNullableCopy(patch, "customDescription", body.customDescription, COPY_LIMITS.description);
			applyNullableCopy(patch, "customImage", body.customImage, COPY_LIMITS.image);
			applyNullableCopy(patch, "imageAlt", body.imageAlt, COPY_LIMITS.alt);
			applyNullableCopy(patch, "category", body.category, COPY_LIMITS.category);
			applyNullableCopy(patch, "challenge", body.challenge, COPY_LIMITS.challenge);
			applyNullableCopy(patch, "solution", body.solution, COPY_LIMITS.solution);
			applyNullableCopy(patch, "caseStudy", body.caseStudy, COPY_LIMITS.caseStudy);
		} catch (err) {
			return c.json({ error: err instanceof Error ? err.message : "Invalid copy field." }, 400);
		}
		if (body.customTags !== undefined) {
			if (body.customTags === null) {
				patch.customTags = null;
			} else if (
				Array.isArray(body.customTags) &&
				body.customTags.length <= COPY_LIMITS.tags &&
				body.customTags.every((item) => typeof item === "string" && item.trim().length <= 32)
			) {
				patch.customTags = stringifyStringArray(body.customTags);
			} else {
				return c.json({ error: "Tags must be an array of up to 12 short labels." }, 400);
			}
		}

		if (Object.keys(patch).length === 0) return c.json({ error: "No recognised fields to update" }, 400);

		const { db } = c.get("services");
		const updated = await db.update(repos).set(patch).where(eq(repos.id, id)).returning();
		const row = updated[0];
		if (!row) return c.json({ error: "Repository not found" }, 404);
		await refreshFeaturedFlags(db);

		const actor = c.get("session").user;
		await writeAudit(db, {
			action: "repo.updated",
			entityType: "repo",
			entityId: String(row.id),
			summary: `${actor.email} updated ${row.slug}.`,
			metadata: { changed: Object.keys(patch) },
			actor,
		});
		await notifyAdmins(db, {
			kind: "admin-action",
			level: "info",
			title: "Project updated",
			message: `${row.slug} was updated in the admin dashboard.`,
			link: "/admin/repos",
			metadata: { repoId: row.id, changed: Object.keys(patch) },
		});

		const allRows = await db.select().from(repos);
		return c.json({ repo: buildAdminRepos(allRows).find((repo) => repo.id === row.id) ?? null });
	});

	router.post("/sync", async (c) => {
		const { db } = c.get("services");
		const actor = c.get("session").user;
		const kickoff = await kickoffGithubSync(c.env, db, {
			trigger: "manual",
			actor,
		});
		if (kickoff.task) c.executionCtx.waitUntil(kickoff.task);
		return c.json({
			started: kickoff.started,
			runId: kickoff.runId,
			message: kickoff.message,
		});
	});

	router.get("/sync-log", async (c) => {
		const { db } = c.get("services");
		const rows = await db.select().from(syncLog).orderBy(desc(syncLog.runAt)).limit(20);
		return c.json({ runs: rows.map(toSyncRun) });
	});

	router.get("/audit-log", async (c) => {
		const { db } = c.get("services");
		const rows: AuditEntry[] = await recentAuditEntries(db, 30);
		return c.json({ items: rows });
	});

	router.get("/users", async (c) => {
		const { db } = c.get("services");
		const [users, sessions] = await Promise.all([
			db.select().from(user).orderBy(desc(user.createdAt)),
			db.select().from(session).orderBy(desc(session.createdAt)),
		]);

		const byUser = new Map<string, typeof sessions>();
		for (const row of sessions) {
			const current = byUser.get(row.userId) ?? [];
			current.push(row);
			byUser.set(row.userId, current);
		}

		const payload: AdminUser[] = users.map((row) => {
			const userSessions = byUser.get(row.id) ?? [];
			const lastSignIn = userSessions[0]?.createdAt ?? null;
			const activeSessions = userSessions.filter((item) => item.expiresAt.getTime() > Date.now()).length;
			return {
				id: row.id,
				name: row.name,
				email: row.email,
				image: row.image ?? null,
				role: row.role ?? "user",
				banned: Boolean(row.banned),
				banReason: row.banReason ?? null,
				createdAt: row.createdAt?.toISOString() ?? null,
				updatedAt: row.updatedAt?.toISOString() ?? null,
				lastSignInAt: lastSignIn?.toISOString() ?? null,
				activeSessions,
				recentAccess: userSessions.slice(0, 3).map(formatAccess),
			};
		});

		return c.json({ users: payload });
	});

	router.patch("/users/:id", async (c) => {
		const targetId = c.req.param("id");
		const body = await c.req
			.json<{ role?: "user" | "member" | "admin"; banned?: boolean; banReason?: string | null }>()
			.catch(() => null);
		if (!body) return c.json({ error: "Invalid JSON body" }, 400);
		if (
			body.role !== undefined &&
			body.role !== "user" &&
			body.role !== "member" &&
			body.role !== "admin"
		) {
			return c.json({ error: "Invalid role" }, 400);
		}

		const { db } = c.get("services");
		const current = await db.query.user.findFirst({ where: eq(user.id, targetId) });
		if (!current) return c.json({ error: "User not found" }, 404);

		const patch: Partial<typeof user.$inferInsert> = {};
		const remainingAdmins = await countAvailableAdmins(db, targetId);
		if (body.role !== undefined && body.role !== current.role) {
			const guard = canChangeAdminState({
				currentRole: current.role,
				currentBanned: Boolean(current.banned),
				nextRole: body.role,
				nextBanned: typeof body.banned === "boolean" ? body.banned : Boolean(current.banned),
				remainingOtherAdmins: remainingAdmins,
			});
			if (!guard.ok) return c.json({ error: guard.reason }, 400);
			patch.role = body.role;
		}
		if (typeof body.banned === "boolean" && body.banned !== Boolean(current.banned)) {
			const guard = canChangeAdminState({
				currentRole: current.role,
				currentBanned: Boolean(current.banned),
				nextRole: body.role ?? current.role,
				nextBanned: body.banned,
				remainingOtherAdmins: remainingAdmins,
			});
			if (!guard.ok) return c.json({ error: guard.reason }, 400);
			patch.banned = body.banned;
			patch.banReason = body.banned
				? (body.banReason?.trim() || "Access revoked by an administrator.")
				: null;
		}
		if (Object.keys(patch).length === 0) return c.json({ error: "No changes to save" }, 400);

		const updated = await db
			.update(user)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(user.id, targetId))
			.returning();
		const next = updated[0];
		if (!next) return c.json({ error: "User not found" }, 404);

		const actor = c.get("session").user;
		await writeAudit(db, {
			action: "user.updated",
			entityType: "user",
			entityId: targetId,
			summary: `${actor.email} updated access for ${next.email}.`,
			metadata: { role: next.role, banned: Boolean(next.banned) },
			actor,
		});
		await notifyAdmins(db, {
			kind: "admin-action",
			level: "info",
			title: "Access updated",
			message: `${next.email} is now ${next.role ?? "user"}${next.banned ? " (suspended)" : ""}.`,
			link: "/admin/users",
			metadata: { userId: targetId },
		});
		await notifyUser(db, targetId, {
			kind: "access-change",
			level: next.banned ? "warning" : "info",
			title: next.banned ? "Access suspended" : "Access updated",
			message: next.banned
				? next.banReason ?? "Your access has been suspended by an administrator."
				: `Your role is now ${next.role ?? "user"}.`,
			link: "/notifications",
			metadata: { role: next.role, banned: Boolean(next.banned) },
		});

		return c.json({ ok: true });
	});

	router.post("/users/:id/revoke-sessions", async (c) => {
		const targetId = c.req.param("id");
		const { db } = c.get("services");
		const target = await db.query.user.findFirst({ where: eq(user.id, targetId) });
		if (!target) return c.json({ error: "User not found" }, 404);
		await db.delete(session).where(eq(session.userId, targetId));
		const actor = c.get("session").user;
		await writeAudit(db, {
			action: "user.sessions-revoked",
			entityType: "user",
			entityId: targetId,
			summary: `${actor.email} revoked sessions for ${target.email}.`,
			actor,
		});
		await notifyUser(db, targetId, {
			kind: "access-change",
			level: "warning",
			title: "Sessions revoked",
			message: "An administrator signed you out on all devices.",
			link: "/login",
		});
		return c.json({ ok: true });
	});

	router.get("/notifications", async (c) => {
		const { db } = c.get("services");
		const feed = await notificationFeed(db, { audience: ["admin"], limit: 40 });
		return c.json(feed);
	});

	router.post("/notifications/:id/read", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid notification id" }, 400);
		const { db } = c.get("services");
		const found = await db.query.notifications.findFirst({ where: eq(notifications.id, id) });
		if (!found || found.audience !== "admin") return c.json({ error: "Notification not found" }, 404);
		await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
		return c.json({ ok: true });
	});

	return router;
}

function toSyncRun(row: typeof syncLog.$inferSelect): SyncRun {
	return {
		id: row.id,
		runAt: row.runAt.toISOString(),
		status: row.status as SyncRun["status"],
		trigger: row.trigger as SyncRun["trigger"],
		repoCount: row.repoCount,
		discoveredCount: row.discoveredCount,
		durationMs: row.durationMs,
		message: row.message ?? null,
		rateLimitRemaining: row.rateLimitRemaining ?? null,
		rateLimitLimit: row.rateLimitLimit ?? null,
		rateLimitResetAt: row.rateLimitResetAt?.toISOString() ?? null,
	};
}

function applyNullableCopy<T extends Record<string, unknown>>(
	patch: T,
	key: keyof T,
	value: string | null | undefined,
	maxLength: number,
) {
	if (value === undefined) return;
	if (value === null) {
		patch[key] = null as T[keyof T];
		return;
	}
	const next = value.trim();
	if (next.length === 0) {
		patch[key] = null as T[keyof T];
		return;
	}
	if (next.length > maxLength) {
		throw new Error(`${String(key)} is too long.`);
	}
	patch[key] = next as T[keyof T];
}

async function countAvailableAdmins(db: Database, excludingId: string) {
	const rows = await db.select().from(user);
	return rows.filter((row) => row.id !== excludingId && row.role === "admin" && !row.banned).length;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function formatAccess(row: typeof session.$inferSelect): string {
	const when = row.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
	const device = row.userAgent?.split(" ")[0] ?? "browser";
	return `${when} · ${device}`;
}
