import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "./app";

/**
 * Resolve the current session, or throw 401.
 *
 * This is the ONLY place that validates a session for API routes, so the check
 * cannot be forgotten by a new handler.
 */
export const requireSession = createMiddleware<AppContext>(async (c, next) => {
	const { auth } = c.get("services");

	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session) {
		throw new HTTPException(401, { message: "Not signed in." });
	}

	// A banned user still has a technically-valid session in some flows; the
	// admin plugin sets `banned`, so enforce it here as well.
	if (session.user.banned) {
		throw new HTTPException(403, {
			message: session.user.banReason ?? "Access suspended.",
		});
	}

	c.set("session", session);
	await next();
});

/**
 * Require the `admin` role.
 *
 * GOTCHA worth repeating because it costs hours: better-auth's admin plugin has
 * TWO authorization layers. Your own check (this middleware) AND the plugin's
 * internal `user.role === "admin"` database check must BOTH pass. If you grant
 * yourself admin only via an env-var allowlist and not in the database, every
 * /api/auth/admin/* endpoint returns 403 while your own routes work — which
 * looks like a bug in better-auth but is not.
 *
 * Bootstrap the first admin with:  npm run auth:create-admin
 */
export const requireAdmin = createMiddleware<AppContext>(async (c, next) => {
	const session = c.get("session");

	if (!session || session.user.role !== "admin") {
		throw new HTTPException(403, {
			message: "Administrator access required.",
		});
	}

	await next();
});
