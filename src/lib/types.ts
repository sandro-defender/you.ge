/**
 * Types shared between the server (Hono) and the client (React routes).
 *
 * WHY THIS MODULE EXISTS
 * TanStack Start enforces import protection: client code must not import from
 * server modules, even for types, because the bundler resolves the module graph
 * before type erasure and will error on the crossing. Any type that both sides
 * need lives here instead — a dependency-free leaf that neither layer owns.
 */

export type RepoScoreBreakdown = {
	activity: number;
	stars: number;
	language: number;
	description: number;
	topics: number;
	homepage: number;
	priority: number;
	total: number;
};

export type ProjectHealth = "launch-ready" | "strong" | "active" | "quiet";

export type PublicProject = {
	id: number;
	owner: string;
	name: string;
	slug: string;
	title: string;
	description: string | null;
	githubDescription: string | null;
	url: string;
	homepage: string | null;
	language: string | null;
	stars: number;
	forks: number;
	openIssues: number;
	topics: string[];
	tags: string[];
	featured: boolean;
	showOnHomepage: boolean;
	image: string | null;
	imageAlt: string | null;
	category: string | null;
	health: ProjectHealth;
	healthLabel: string;
	score: number;
	pushedAt: string | null;
	createdAt: string | null;
	lastSyncedAt: string | null;
	challenge: string | null;
	solution: string | null;
	caseStudy: string | null;
};

export type PublicProjectDetail = PublicProject & {
	related: PublicProject[];
	scoreBreakdown: RepoScoreBreakdown;
};

export type HomeSummary = {
	totalProjects: number;
	featuredProjects: number;
	totalStars: number;
	activeLanguages: number;
	lastSyncAt: string | null;
	lastUpdateAt: string | null;
};

export type HomeTopic = { name: string; count: number };

export type HomeData = {
	summary: HomeSummary;
	featuredProjects: PublicProject[];
	topLanguages: HomeTopic[];
	topTopics: HomeTopic[];
};

export type AdminRepo = PublicProject & {
	customTitle: string | null;
	customDescription: string | null;
	customTags: string[];
	customImage: string | null;
	manualPriority: number;
	featuredOverride: boolean | null;
	hidden: boolean;
	sortOrder: number;
	scoreBreakdown: RepoScoreBreakdown;
};

export type SyncRun = {
	id: number;
	runAt: string;
	status: "running" | "ok" | "error" | "skipped";
	trigger: "cron" | "manual";
	repoCount: number;
	discoveredCount: number;
	durationMs: number;
	message: string | null;
	rateLimitRemaining: number | null;
	rateLimitLimit: number | null;
	rateLimitResetAt: string | null;
};

export type AdminOverview = {
	totals: {
		repositories: number;
		featured: number;
		hidden: number;
		activeUsers: number;
		pendingActions: number;
		failedSyncs: number;
		unreadNotifications: number;
	};
	lastSync: SyncRun | null;
	recentSyncs: SyncRun[];
	recentAudit: AuditEntry[];
	recentNotifications: NotificationItem[];
};

export type AdminUser = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string | null;
	banned: boolean;
	banReason: string | null;
	createdAt: string | null;
	updatedAt: string | null;
	lastSignInAt: string | null;
	activeSessions: number;
	recentAccess: string[];
};

export type AuditEntry = {
	id: number;
	action: string;
	entityType: string;
	entityId: string | null;
	summary: string;
	actorUserId: string | null;
	actorName: string | null;
	actorEmail: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
};

export type NotificationItem = {
	id: number;
	kind: string;
	level: "info" | "success" | "warning" | "error";
	title: string;
	message: string;
	link: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	readAt: string | null;
};

export type NotificationFeed = {
	items: NotificationItem[];
	unreadCount: number;
};

export type ProjectSort = "featured" | "activity" | "stars" | "name";

export type ProjectFilterState = {
	search: string;
	language: string;
	topic: string;
	featured: "all" | "featured";
	sort: ProjectSort;
};
