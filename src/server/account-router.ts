import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { notifications } from "../db/schema";
import { audiencesForUser } from "../lib/notifications";
import { notificationFeed } from "./audit";
import type { AppContext } from "./app";

export function createAccountRouter() {
	const router = new Hono<AppContext>();

	router.get("/notifications", async (c) => {
		const { db } = c.get("services");
		const session = c.get("session");
		const limit = clamp(Number(c.req.query("limit") ?? 40), 1, 100);
		const audience = audiencesForUser(session.user.id, session.user.role);
		return c.json(await notificationFeed(db, { audience, limit }));
	});

	router.post("/notifications/read-all", async (c) => {
		const { db } = c.get("services");
		const session = c.get("session");
		const audience = audiencesForUser(session.user.id, session.user.role);
		await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(inArray(notifications.audience, audience));
		return c.json({ ok: true });
	});

	router.post("/notifications/:id/read", async (c) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid notification id" }, 400);
		const { db } = c.get("services");
		const session = c.get("session");
		const audience = audiencesForUser(session.user.id, session.user.role);
		const found = await db.query.notifications.findFirst({
			where: eq(notifications.id, id),
		});
		if (!found || !audience.includes(found.audience)) {
			return c.json({ error: "Notification not found" }, 404);
		}
		await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
		return c.json({ ok: true });
	});

	return router;
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}
