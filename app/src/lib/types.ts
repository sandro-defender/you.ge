/**
 * Types shared between the server (Hono) and the client (React routes).
 *
 * WHY THIS MODULE EXISTS
 * TanStack Start enforces import protection: client code must not import from
 * server modules, even for types, because the bundler resolves the module graph
 * before type erasure and will error on the crossing. Any type that both sides
 * need lives here instead — a dependency-free leaf that neither layer owns.
 */

/**
 * A repository as the browser is allowed to see it.
 *
 * This is a deliberate PROJECTION, not the database row. The `repos` table also
 * carries `hidden` and admin curation state; `/api/projects` returns only what
 * is safe and useful to render. Never send a `select()` row straight to a
 * client — the auth tables carry tokens, and this habit is what stops that.
 */
export type PublicProject = {
	id: number;
	owner: string;
	name: string;
	slug: string;
	url: string;
	homepage: string | null;
	language: string | null;
	stars: number;
	forks: number;
	openIssues: number;
	topics: string[];
	featured: boolean;
	description: string | null;
	pushedAt: string | null;
};

/** Row shape returned by the admin endpoints (full record, curation included). */
export type AdminRepo = {
	id: number;
	owner: string;
	name: string;
	slug: string;
	description: string | null;
	customDescription: string | null;
	homepage: string | null;
	url: string;
	language: string | null;
	stars: number;
	forks: number;
	openIssues: number;
	topics: string | null;
	featured: boolean;
	hidden: boolean;
	sortOrder: number;
	lastSyncedAt: number | Date | null;
};

/** A row from `sync_log`, for the admin panel's sync history. */
export type SyncRun = {
	id: number;
	runAt: number | Date;
	status: string;
	repoCount: number;
	durationMs: number;
	message: string | null;
};
