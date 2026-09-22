import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../lib/env";
import { createServices, type Services } from "./context";
import { createAuthRouter } from "./auth-routes";
import { createReposRouter } from "./repos-router";
import { createAdminRouter } from "./admin-router";
import { requireSession, requireAdmin, requireMember } from "./guard";

/**
 * Hono's generic, declared once so every handler gets typed `c.env` (D1 and
 * secrets), `c.get("services")`, and `c.get("session")`.
 *
 * `Env` here is the CLOUDFLARE Env type (what the Worker receives), which is
 * structurally the same as src/lib/env.ts's `Env`.
 */
export type AppContext = {
	// Our Env (Cloudflare.Env & Secrets) — NOT the generated Cloudflare.Env,
	// which lacks the secrets and would make createServices() unassignable.
	Bindings: Env;
	Variables: {
		services: Services;
		session: NonNullable<Awaited<ReturnType<Services["auth"]["api"]["getSession"]>>>;
	};
};

/**
 * The API layer. Mounted at /api by src/server.ts, which intercepts /api/*
 * BEFORE handing anything to TanStack Start.
 *
 * ── WHY A CUSTOM SERVER ENTRY INSTEAD OF TANSTACK "SERVER ROUTES" ───────────
 * The pattern you will find in blog posts — a route file exporting
 * `server: { handlers: { GET, POST } }` — does not exist in TanStack Start
 * 1.168. `createFileRoute` has no `server` option and `createServerRoute` is
 * not exported. Verified against the installed packages, not assumed.
 *
 * Intercepting in the Worker entry is also the better design here, because
 * better-auth needs RAW HTTP endpoints at exact URLs: Google redirects the
 * browser straight to /api/auth/callback/google, which must be a real route,
 * not an RPC-style server function. And in the Worker entry, `fetch` receives
 * `(request, env, ctx)` natively — so the D1 binding is available without any
 * runtime-specific context helper.
 */
export function createApp() {
	const app = new Hono<AppContext>();

	// ── Per-request services ────────────────────────────────────────────────
	// Must be first: everything downstream reads c.get("services").
	app.use("*", async (c, next) => {
		c.set("services", createServices(c.env));
		await next();
	});

	app.use("*", secureHeaders());

	// ── Public ──────────────────────────────────────────────────────────────
	app.get("/health", (c) =>
		c.json({ ok: true, ts: new Date().toISOString() }),
	);

	// ── better-auth: sign-in, Google callback, sessions, and every
	//    /api/auth/admin/* endpoint the admin plugin provides ────────────────
	app.route("/auth", createAuthRouter());

	// ── Authenticated + explicitly granted ──────────────────────────────────
	// Order matters: requireSession populates c.get("session"), which
	// requireMember then reads. A plain sign-in (role "user") is NOT enough —
	// an admin must have granted "member" from /admin/users. This mirrors the
	// ACCESS_POLICY "member" entry in src/server.ts (pages and API must agree).
	app.use("/projects/*", requireSession, requireMember);
	app.route("/projects", createReposRouter());

	// ── Admin only ──────────────────────────────────────────────────────────
	// Order matters: requireSession populates c.get("session"), which
	// requireAdmin then reads. Reversing these would always 403.
	app.use("/admin/*", requireSession, requireAdmin);
	app.route("/admin", createAdminRouter());

	// ── Error shaping ───────────────────────────────────────────────────────
	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			return err.getResponse();
		}
		console.error("[api] unhandled error:", err);
		// Never leak a stack trace or SQL error to a browser.
		return c.json({ error: "Internal server error" }, 500);
	});

	app.notFound((c) => c.json({ error: "Not found" }, 404));

	return app;
}
