/**
 * Worker entrypoint — the security boundary of the whole app.
 *
 *   /api/*            → Hono  (auth, admin, projects, D1)
 *   gated page paths  → session validated HERE, then TanStack Start renders
 *   everything else   → TanStack Start renders
 *
 * ── WHY ROUTE GATING LIVES IN THIS FILE AND NOT IN A ROUTE LOADER ───────────
 * Two hard constraints, both verified against the installed packages:
 *
 *   1. Start's handler is `RequestHandler = (request, options) => Response`.
 *      It never receives `env`, so no route loader or server function can reach
 *      the D1 binding directly.
 *   2. `cloudflare:workers` in this dependency set exports only RpcStub,
 *      RpcTarget, WorkerEntrypoint and DurableObject — there is no
 *      `getCloudflareContext()` to recover `env` from async context.
 *
 * A Worker's `fetch(request, env, ctx)` is therefore the ONLY place with both
 * the request and the database. So the permission check happens here, before
 * Start renders anything. That is strictly better than a client-side guard:
 * gated HTML is never produced for an unauthorised caller, and a 302/403 is
 * returned instead.
 *
 * ── WHY THIS IS CHEAP ON WORKERS FREE ───────────────────────────────────────
 * `auth.api.getSession` is served from better-auth's signed `cookieCache`
 * cookie for up to 5 minutes (configured in src/lib/auth.ts), so most page
 * views cost ZERO D1 rows. Only cache misses hit the database.
 *
 * ── PRERENDERING WARNING ────────────────────────────────────────────────────
 * Never add a path listed in ACCESS_POLICY to TanStack Start's `prerender`
 * config. A prerendered route is emitted as a static file and served from
 * `assets.directory` WITHOUT invoking this Worker — which would publish gated
 * content to everyone and silently bypass every check below.
 */
import startHandler from "@tanstack/react-start/server-entry";
import { createApp } from "./server/app";
import { createAuth } from "./lib/auth";
import { createDb } from "./lib/db";
import { syncGithubRepos } from "./server/github-sync";
import { gatePage } from "./server/gate-page";
import { INTERNAL_SESSION_HEADER as SESSION_HEADER } from "./lib/internal-header";
import { ADMIN_ROLES, PROJECT_ROLES, hasRole } from "./lib/roles";
import type { Env } from "./lib/env";

const app = createApp();

/**
 * Which paths require what. Longest prefix wins.
 *
 * ACCESS LEVELS (the explicit-grant access model — see src/lib/roles.ts):
 *   "member" — valid, unbanned session AND role ∈ {admin, member}.
 *              Google sign-in alone yields role "user", which is NOT enough:
 *              an admin must grant `member` from /admin/users first.
 *   "admin"  — valid, unbanned session AND role ∈ {admin}.
 */
const ACCESS_POLICY: ReadonlyArray<{
	prefix: string;
	requires: "member" | "admin";
}> = [
	{ prefix: "/admin", requires: "admin" },
	{ prefix: "/projects", requires: "member" },
];

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const cleanRequest = stripInternalHeaders(request);
		const url = new URL(cleanRequest.url);
		const { pathname } = url;

		// ── 1. API → Hono ───────────────────────────────────────────────────
		if (pathname === "/api" || pathname.startsWith("/api/")) {
			const apiRequest = new Request(
				new URL(pathname.slice("/api".length) || "/", url),
				cleanRequest,
			);
			return app.fetch(apiRequest, env, ctx);
		}

		// ── 2. Gated pages → validate, then render ──────────────────────────
		const rule = ACCESS_POLICY.find((r) =>
			pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
		);

		if (rule) {
			const auth = createAuth(env);
			const session = await auth.api.getSession({
				headers: cleanRequest.headers,
			});

			if (!session) {
				// Preserve the intended destination so login can return to it.
				const next = encodeURIComponent(pathname + url.search);
				return Response.redirect(`${url.origin}/login?next=${next}`, 302);
			}

			if (session.user.banned) {
				// banReason is stored admin-set text — gatePage HTML-escapes it.
				return gatePage({
					status: 403,
					kind: "suspended",
					title: "Access suspended",
					message:
						session.user.banReason ??
						"Your access to this site has been suspended.",
				});
			}

			// Explicit grant: signing in is not enough for /projects — an admin
			// must have set role to "member" (or "admin") from /admin/users.
			// COPY IS LOAD-BEARING: scripts/role-matrix-smoke.sh matches
			// "not been granted" in this body, and the same string comes from
			// requireMember for the API. Change both together or neither.
			if (rule.requires === "member" && !hasRole(session.user.role, PROJECT_ROLES)) {
				return gatePage({
					status: 403,
					kind: "pending",
					title: "Access pending",
					message:
						"Your account has not been granted access yet. An administrator must approve it from the admin panel.",
					hint: "Already approved? Role changes can take up to five minutes to reach your session — check back shortly.",
				});
			}

			if (rule.requires === "admin" && !hasRole(session.user.role, ADMIN_ROLES)) {
				return gatePage({
					status: 403,
					kind: "denied",
					title: "Admin area",
					message: "Administrator access required.",
					hint: "This area is restricted to administrator accounts.",
				});
			}

			// Start's handler is typed (request, options?) => Response and never
			// receives env — which is precisely why the permission check above has
			// to live here in the Worker entry rather than inside a route loader.
			return startHandler.fetch(withSessionHeader(cleanRequest, session));
		}

		// ── 3. Public pages → render ────────────────────────────────────────
		// Static assets (CSS, JS, images) are served by the platform from
		// `assets.directory` and never reach this code at all.
		return startHandler.fetch(cleanRequest);
	},

	/**
	 * Runs on the cron in wrangler.jsonc ("0 *\/6 * * *").
	 *
	 * Scheduled invocations are FREE on Workers Free and do not count toward the
	 * 100k requests/day allowance — and Cloudflare Pages cannot do this at all.
	 * This is what keeps GitHub's 60-requests/hour unauthenticated limit from
	 * ever mattering: pages read D1, and D1 is refreshed here.
	 *
	 * `waitUntil` keeps the isolate alive until the sync finishes instead of
	 * tearing it down the moment `scheduled()` returns.
	 */
	async scheduled(
		_controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		ctx.waitUntil(syncGithubRepos(env, createDb(env.DB)));
	},
} satisfies ExportedHandler<Env>;

// ─────────────────────────────────────────────────────────────────────────────

/** Drop our internal header from anything a client sent. */
function stripInternalHeaders(request: Request): Request {
	if (!request.headers.has(SESSION_HEADER)) return request;

	const headers = new Headers(request.headers);
	headers.delete(SESSION_HEADER);
	// `new Request(url, init)` cannot take a body from an existing Request in
	// every runtime, so pass the body explicitly and guard GET/HEAD (which must
	// not carry one).
	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	return new Request(request.url, {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		redirect: "manual",
	});
}

type SessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
};

/** Attach the validated session for server functions to read. */
function withSessionHeader(
	request: Request,
	session: { user: SessionUser },
): Request {
	const headers = new Headers(request.headers);
	const { id, name, email, image, role } = session.user;
	headers.set(SESSION_HEADER, JSON.stringify({ id, name, email, image, role }));

	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	return new Request(request.url, {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		redirect: "manual",
	});
}
