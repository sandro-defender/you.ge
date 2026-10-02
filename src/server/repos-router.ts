import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { repos } from "../db/schema";
import type { AppContext } from "./app";
import { buildProjectDetail, buildPublicProjects } from "./project-data";

export function createReposRouter() {
	const router = new Hono<AppContext>();

	router.get("/", async (c) => {
		const { db } = c.get("services");
		const rows = await db.select().from(repos).where(eq(repos.hidden, false));
		return c.json({ projects: buildPublicProjects(rows) });
	});

	router.get("/:owner/:name", async (c) => {
		const slug = `${c.req.param("owner")}/${c.req.param("name")}`;
		const { db } = c.get("services");
		const rows = await db.select().from(repos).where(eq(repos.hidden, false));
		const detail = buildProjectDetail(slug, rows);
		if (!detail) return c.json({ error: "Not found" }, 404);
		return c.json({ project: detail });
	});

	return router;
}
