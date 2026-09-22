import { Hono } from "hono";
import type { AppContext } from "./app";

/**
 * better-auth owns every path under /api/auth.
 *
 * Its `handler(request)` is a complete fetch-style handler that does its own
 * internal routing — /api/auth/sign-in/social, /api/auth/callback/google,
 * /api/auth/get-session, /api/auth/sign-out, and all the admin plugin endpoints
 * under /api/auth/admin/*. We hand it the raw Request and return its Response
 * untouched.
 *
 * Because it is mounted with `app.all("/auth/*")` inside the /api router, the
 * incoming URL path still reads /api/auth/... which is exactly what better-auth
 * expects when it derives callback URLs from `baseURL`.
 */
export function createAuthRouter() {
	const router = new Hono<AppContext>();

	router.all("/*", async (c) => {
		const { auth } = c.get("services");
		return auth.handler(c.req.raw);
	});

	return router;
}
