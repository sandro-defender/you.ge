import { Hono } from "hono";
import type { AppContext } from "./app";

/**
 * better-auth owns every path under /api/auth.
 *
 * Its `handler(request)` is a complete fetch-style handler that does its own
 * internal routing — /api/auth/sign-in/social, /api/auth/callback/google,
 * /api/auth/get-session, /api/auth/sign-out, and all the admin plugin
 * endpoints under /api/auth/admin/*. We hand it the Request and return its
 * Response untouched.
 *
 * ── THE /api PREFIX MUST BE RESTORED (bug found 2026-09-22) ─────────────────
 * src/server.ts maps `/api/*` into Hono by stripping the `/api` segment
 * (`new URL(pathname.slice("/api"), …)`), so this router receives paths like
 * `/auth/get-session`. The old comment claimed "the incoming URL path still
 * reads /api/auth/..." — that was WRONG. better-auth derives routes from
 * `baseURL + basePath`, basePath defaults to `/api/auth`, and `/auth/x`
 * matches nothing: every HTTP auth endpoint (sign-in, OAuth callback,
 * get-session, admin/… ) returned 404 while `auth.api.getSession({headers})`
 * (a direct function call, used by the page gate) kept working — which is
 * exactly why the smoke tests in HANDOVER §5 never caught it.
 *
 * Fix: rebuild the URL with the `/api` prefix restored before handing the
 * request over, so the path better-auth sees is the documented
 * `/api/auth/...` (the same URIs registered in Google Cloud Console).
 */
export function createAuthRouter() {
	const router = new Hono<AppContext>();

	router.all("/*", async (c) => {
		const { auth } = c.get("services");
		const raw = c.req.raw;
		const url = new URL(raw.url);
		const restored = new Request(
			new URL(`/api${url.pathname}${url.search}`, url),
			{
				method: raw.method,
				headers: raw.headers,
				// GET/HEAD must not carry a body; other methods forward the stream.
				body:
					raw.method !== "GET" && raw.method !== "HEAD" ? raw.body : undefined,
				redirect: "manual",
			},
		);
		return auth.handler(restored);
	});

	return router;
}
