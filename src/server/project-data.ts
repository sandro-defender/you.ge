import { repos } from "../db/schema";
import { compareProjects, getProjectHealth, resolveFeaturedProjectIds } from "../lib/repo-ranking";
import type { AdminRepo, PublicProject, PublicProjectDetail, RepoScoreBreakdown } from "../lib/types";

type RepoRow = typeof repos.$inferSelect;

export function buildPublicProjects(rows: RepoRow[]): PublicProject[] {
	const featuredIds = resolveFeaturedProjectIds(rows);
	return rows
		.filter((row) => !row.hidden)
		.map((row) => toPublicProject(row, featuredIds))
		.sort((a, b) => compareProjects(a, b, "featured"));
}

export function buildAdminRepos(rows: RepoRow[]): AdminRepo[] {
	const featuredIds = resolveFeaturedProjectIds(rows);
	return rows
		.map((row) => toAdminRepo(row, featuredIds))
		.sort((a, b) => compareProjects(a, b, "featured"));
}

export function buildProjectDetail(slug: string, rows: RepoRow[]): PublicProjectDetail | null {
	const projects = buildPublicProjects(rows);
	const current = projects.find((project) => project.slug === slug);
	if (!current) return null;

	const related = projects
		.filter((project) => project.slug !== slug)
		.map((project) => ({
			project,
			score: overlapScore(current.tags, project.tags) + (project.language === current.language ? 1 : 0),
		}))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || compareProjects(a.project, b.project, "featured"))
		.slice(0, 3)
		.map((item) => item.project);

	return {
		...current,
		related,
		scoreBreakdown: scoreBreakdownFromRow(rows.find((row) => row.slug === slug) ?? null),
	};
}

export function parseStringArray(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((value): value is string => typeof value === "string");
	} catch {
		return [];
	}
}

export function stringifyStringArray(values: string[]): string {
	return JSON.stringify(Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))));
}

function toAdminRepo(row: RepoRow, featuredIds: Set<number>): AdminRepo {
	const project = toPublicProject(row, featuredIds);
	return {
		...project,
		customTitle: row.customTitle,
		customDescription: row.customDescription,
		customTags: parseStringArray(row.customTags),
		customImage: row.customImage,
		manualPriority: row.manualPriority,
		featuredOverride: row.featuredOverride,
		hidden: row.hidden,
		sortOrder: row.sortOrder,
		scoreBreakdown: scoreBreakdownFromRow(row),
	};
}

function toPublicProject(row: RepoRow, featuredIds: Set<number>): PublicProject {
	const title = row.customTitle?.trim() || row.name;
	const description = row.customDescription?.trim() || row.description;
	const tags = resolveTags(row);
	const { health, label } = getProjectHealth(row.score);

	return {
		id: row.id,
		owner: row.owner,
		name: row.name,
		slug: row.slug,
		title,
		description,
		githubDescription: row.description,
		url: row.url,
		homepage: row.homepage,
		language: row.language,
		stars: row.stars,
		forks: row.forks,
		openIssues: row.openIssues,
		topics: parseStringArray(row.topics),
		tags,
		featured: featuredIds.has(row.id),
		showOnHomepage: row.showOnHomepage || featuredIds.has(row.id),
		image: row.customImage,
		imageAlt: row.imageAlt ?? `${title} project preview`,
		category: normaliseNullable(row.category),
		health,
		healthLabel: label,
		score: row.score,
		pushedAt: row.githubPushedAt?.toISOString() ?? null,
		createdAt: row.githubCreatedAt?.toISOString() ?? null,
		lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
		challenge: normaliseNullable(row.challenge),
		solution: normaliseNullable(row.solution),
		caseStudy: normaliseNullable(row.caseStudy),
	};
}

function resolveTags(row: RepoRow): string[] {
	const custom = parseStringArray(row.customTags);
	const base = custom.length > 0 ? custom : parseStringArray(row.topics);
	return Array.from(new Set([row.language, ...base].filter((value): value is string => Boolean(value))));
}

function scoreBreakdownFromRow(row: RepoRow | null): RepoScoreBreakdown {
	if (!row?.scoreBreakdown) {
		return {
			activity: 0,
			stars: 0,
			language: row?.language ? 8 : 0,
			description: row?.description ? 8 : 0,
			topics: parseStringArray(row?.topics ?? null).length * 2,
			homepage: row?.homepage ? 8 : 0,
			priority: row?.manualPriority ? row.manualPriority * 4 : 0,
			total: row?.score ?? 0,
		};
	}
	try {
		const parsed = JSON.parse(row.scoreBreakdown) as Partial<RepoScoreBreakdown>;
		return {
			activity: Number(parsed.activity ?? 0),
			stars: Number(parsed.stars ?? 0),
			language: Number(parsed.language ?? 0),
			description: Number(parsed.description ?? 0),
			topics: Number(parsed.topics ?? 0),
			homepage: Number(parsed.homepage ?? 0),
			priority: Number(parsed.priority ?? 0),
			total: Number(parsed.total ?? row.score ?? 0),
		};
	} catch {
		return {
			activity: 0,
			stars: 0,
			language: 0,
			description: 0,
			topics: 0,
			homepage: 0,
			priority: 0,
			total: row.score,
		};
	}
}

function overlapScore(a: string[], b: string[]): number {
	const set = new Set(a);
	return b.reduce((total, item) => total + (set.has(item) ? 1 : 0), 0);
}

function normaliseNullable(value: string | null): string | null {
	const next = value?.trim();
	return next ? next : null;
}
