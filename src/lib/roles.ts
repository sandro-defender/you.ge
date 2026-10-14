/**
 * Role model — dependency-free leaf, importable from the Worker entry, the
 * Hono guards AND client components (src/lib/types.ts-style constraint: client
 * code must not reach into src/lib/auth.ts, which pulls the whole better-auth
 * server graph through import protection).
 *
 * ── THE ACCESS MODEL (chosen: explicit role grant, not a separate column) ────
 *   user   — signed in with Google; creates an account; NO project access.
 *   member — an admin granted them access to /projects + /api/projects.
 *   admin  — everything member has, plus /admin, /admin/users, /admin/repos
 *            and the better-auth /api/auth/admin/* endpoints (which ALSO
 *            check `role === "admin"` in the database — two layers, see
 *            src/server/guard.ts).
 *
 * Grants/revokes happen from the admin panel's Users page, which calls the
 * app's own PATCH /api/admin/users/:id (src/server/admin-router.ts); better-
 * auth's /api/auth/admin/set-role stays available too, and both paths share
 * the last-admin guard in ./admin-guards.ts. Roles are stored as a single
 * comma-separated string (`"admin"` / `"member"` / `"user"`, or
 * `"admin,member"` — better-auth's setRole joins role arrays with ","), so
 * every check below splits on commas — never compare `role === "member"`
 * directly.
 *
 * Verified against better-auth 1.7.5's admin plugin: setRole validates each
 * value against the configured `roles` map when one is provided — and
 * src/lib/auth.ts passes `roles: siteRoles`, so an unknown role name is
 * rejected with 400. The column itself is plain `text` with no CHECK
 * constraint (drizzle/0000_*.sql), so direct SQL can still write anything —
 * which is why hasRole() fails closed on unknown strings.
 */

export const ROLES = ["admin", "member", "user"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may view /projects and call /api/projects. */
export const PROJECT_ROLES = ["admin", "member"] as const;

/** Roles that may enter /admin, /admin/* and /api/admin/*. */
export const ADMIN_ROLES = ["admin"] as const;

/**
 * True when the stored role string (possibly comma-separated) holds ANY of
 * `allowed`. Missing/null role → false (fail closed; a user row without a
 * role must not inherit access).
 */
export function hasRole(
	role: string | null | undefined,
	allowed: readonly string[],
): boolean {
	if (!role) return false;
	const held = role.split(",").map((r) => r.trim()).filter(Boolean);
	return allowed.some((r) => held.includes(r));
}
