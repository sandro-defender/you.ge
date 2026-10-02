import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { repos, syncLog } from "../db/schema";
import type { HomeData, HomeTopic } from "../lib/types";
import { buildPublicProjects } from "./project-data";
import type { AppContext } from "./app";

export function createPublicRouter() {
	const router = new Hono<AppContext>();

	router.get("/home", async (c) => {
		const { db } = c.get("services");
		const [rows, latestSync] = await Promise.all([
			db.select().from(repos).where(eq(repos.hidden, false)),
			db.select().from(syncLog).orderBy(desc(syncLog.runAt)).limit(1),
		]);
		const projects = buildPublicProjects(rows);
		const featuredProjects = projects
			.filter((project) => project.showOnHomepage)
			.slice(0, 6);

		const payload: HomeData = {
			summary: {
				totalProjects: projects.length,
				featuredProjects: projects.filter((project) => project.featured).length,
				totalStars: projects.reduce((total, project) => total + project.stars, 0),
				activeLanguages: new Set(
					projects
						.map((project) => project.language)
						.filter((value): value is string => Boolean(value)),
				).size,
				lastSyncAt: latestSync[0]?.runAt?.toISOString() ?? null,
				lastUpdateAt: projects[0]?.pushedAt ?? null,
			},
			featuredProjects,
			topLanguages: countValues(
				projects.map((project) => project.language).filter((value): value is string => Boolean(value)),
			),
			topTopics: countValues(projects.flatMap((project) => project.tags.filter((tag) => tag !== project.language))),
		};

		return c.json(payload, 200, { "cache-control": "public, max-age=300" });
	});

	return router;
}

function countValues(values: string[]): HomeTopic[] {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
		.slice(0, 6);
}
