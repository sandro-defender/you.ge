import type {
	ProjectFilterState,
	ProjectHealth,
	ProjectSort,
	PublicProject,
	RepoScoreBreakdown,
} from "./types";

export type RepoScoreInput = {
	description: string | null;
	homepage: string | null;
	language: string | null;
	stars: number;
	topics: string[];
	githubPushedAt: Date | null;
	manualPriority: number;
};

export const DEFAULT_PROJECT_FILTERS: ProjectFilterState = {
	search: "",
	language: "all",
	topic: "all",
	featured: "all",
	sort: "featured",
};

const AUTO_FEATURED_COUNT = 4;

export function scoreRepository(input: RepoScoreInput): RepoScoreBreakdown {
	const activity = scoreActivity(input.githubPushedAt);
	const stars = Math.min(18, Math.round(Math.log10(Math.max(1, input.stars) + 1) * 12));
	const language = input.language ? 8 : 0;
	const description = scoreDescription(input.description);
	const topics = Math.min(10, (input.topics?.length ?? 0) * 2);
	const homepage = input.homepage ? 8 : 0;
	const priority = clamp(input.manualPriority * 4, -12, 20);
	const total = clamp(activity + stars + language + description + topics + homepage + priority, 0, 100);
	return { activity, stars, language, description, topics, homepage, priority, total };
}

export function resolveFeaturedProjectIds<T extends {
	id: number;
	hidden?: boolean;
	featuredOverride?: boolean | null;
	score: number;
	sortOrder?: number;
	stars?: number;
	githubPushedAt?: Date | string | null;
}> (rows: T[]): Set<number> {
	const manualOn = rows.filter((row) => row.hidden !== true && row.featuredOverride === true);
	const autoEligible = rows
		.filter((row) => row.hidden !== true && row.featuredOverride !== false)
		.sort(compareFeaturedCandidates)
		.slice(0, AUTO_FEATURED_COUNT);
	return new Set([...manualOn, ...autoEligible].map((row) => row.id));
}

export function getProjectHealth(score: number): { health: ProjectHealth; label: string } {
	if (score >= 78) return { health: "launch-ready", label: "Launch-ready" };
	if (score >= 60) return { health: "strong", label: "Strong health" };
	if (score >= 38) return { health: "active", label: "Actively evolving" };
	return { health: "quiet", label: "Needs a refresh" };
}

export function collectFacets(projects: PublicProject[]) {
	const languages = Array.from(
		new Set(projects.map((project) => project.language).filter((value): value is string => Boolean(value))),
	).sort((a, b) => a.localeCompare(b));
	const topics = Array.from(new Set(projects.flatMap((project) => project.tags))).sort((a, b) =>
		a.localeCompare(b),
	);
	return { languages, topics };
}

export function filterProjects(
	projects: PublicProject[],
	filters: ProjectFilterState,
): PublicProject[] {
	const needle = filters.search.trim().toLowerCase();

	return [...projects]
		.filter((project) => {
			if (filters.language !== "all" && (project.language ?? "") !== filters.language) return false;
			if (filters.topic !== "all" && !project.tags.includes(filters.topic)) return false;
			if (filters.featured === "featured" && !project.featured) return false;
			if (!needle) return true;
			return [
				project.title,
				project.description ?? "",
				project.language ?? "",
				project.tags.join(" "),
				project.category ?? "",
			]
				.join(" ")
				.toLowerCase()
				.includes(needle);
		})
		.sort((a, b) => compareProjects(a, b, filters.sort));
}

export function compareProjects(a: PublicProject, b: PublicProject, sort: ProjectSort): number {
	if (sort === "name") {
		return a.title.localeCompare(b.title);
	}
	if (sort === "stars") {
		return byNumbers(b.stars, a.stars) || byNumbers(b.score, a.score) || fallbackSort(a, b);
	}
	if (sort === "activity") {
		return byDates(b.pushedAt, a.pushedAt) || byNumbers(b.score, a.score) || fallbackSort(a, b);
	}
	return (
		byNumbers(Number(b.showOnHomepage), Number(a.showOnHomepage)) ||
		byNumbers(Number(b.featured), Number(a.featured)) ||
		byNumbers(b.score, a.score) ||
		byDates(b.pushedAt, a.pushedAt) ||
		fallbackSort(a, b)
	);
}

export function relativeTimeLabel(value: string | null): string {
	if (!value) return "Updated recently";
	const diff = Date.now() - Date.parse(value);
	if (!Number.isFinite(diff) || diff < 0) return "Updated recently";

	const minutes = diff / 60_000;
	if (minutes < 1) return "Updated just now";
	if (minutes < 60) return `Updated ${plural(Math.round(minutes), "minute")} ago`;
	const hours = minutes / 60;
	if (hours < 24) return `Updated ${plural(Math.round(hours), "hour")} ago`;
	const days = hours / 24;
	if (days < 8) return `Updated ${plural(Math.round(days), "day")} ago`;
	const weeks = days / 7;
	if (weeks < 5) return `Updated ${plural(Math.round(weeks), "week")} ago`;
	const months = days / 30.44;
	if (months < 12) return `Updated ${plural(Math.round(months), "month")} ago`;
	return `Updated ${plural(Math.round(days / 365.25), "year")} ago`;
}

function compareFeaturedCandidates<
	T extends {
		score: number;
		sortOrder?: number;
		stars?: number;
		githubPushedAt?: Date | string | null;
	},
>(a: T, b: T): number {
	return (
		byNumbers(a.sortOrder ?? 0, b.sortOrder ?? 0) ||
		byNumbers(b.score, a.score) ||
		byNumbers(b.stars ?? 0, a.stars ?? 0) ||
		byDates(b.githubPushedAt ?? null, a.githubPushedAt ?? null)
	);
}

function fallbackSort(a: PublicProject, b: PublicProject): number {
	return byDates(b.pushedAt, a.pushedAt) || a.title.localeCompare(b.title);
}

function scoreActivity(date: Date | null): number {
	if (!date) return 0;
	const ageInDays = (Date.now() - date.getTime()) / 86_400_000;
	if (ageInDays <= 30) return 30;
	if (ageInDays <= 90) return 24;
	if (ageInDays <= 180) return 18;
	if (ageInDays <= 365) return 10;
	if (ageInDays <= 730) return 4;
	return 1;
}

function scoreDescription(value: string | null): number {
	if (!value) return 0;
	const length = value.trim().length;
	if (length >= 120) return 18;
	if (length >= 80) return 14;
	if (length >= 32) return 10;
	return 6;
}

function byDates(a: string | Date | null | undefined, b: string | Date | null | undefined): number {
	return byNumbers(toEpoch(a), toEpoch(b));
}

function toEpoch(value: string | Date | null | undefined): number {
	if (!value) return 0;
	return value instanceof Date ? value.getTime() : Date.parse(value);
}

function byNumbers(a: number, b: number): number {
	return a === b ? 0 : a < b ? -1 : 1;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function plural(count: number, unit: string): string {
	return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
