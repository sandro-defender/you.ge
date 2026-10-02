import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../lib/env";
import { createServices, type Services } from "./context";
import { createAuthRouter } from "./auth-routes";
import { createPublicRouter } from "./public-router";
import { createReposRouter } from "./repos-router";
import { createAdminRouter } from "./admin-router";
import { createAccountRouter } from "./account-router";
import { requireSession, requireAdmin, requireMember } from "./guard";

export type AppContext = {
	Bindings: Env;
	Variables: {
		services: Services;
		session: NonNullable<Awaited<ReturnType<Services["auth"]["api"]["getSession"]>>>;
	};
};

export function createApp() {
	const app = new Hono<AppContext>();

	app.use("*", async (c, next) => {
		c.set("services", createServices(c.env));
		await next();
	});

	app.use("*", secureHeaders());

	app.get("/health", (c) =>
		c.json({ ok: true, ts: new Date().toISOString() }, 200, {
			"cache-control": "no-store",
		}),
	);

	app.route("/auth", createAuthRouter());
	app.route("/public", createPublicRouter());

	app.use("/me/*", requireSession);
	app.route("/me", createAccountRouter());

	app.use("/projects/*", requireSession, requireMember);
	app.route("/projects", createReposRouter());

	app.use("/admin/*", requireSession, requireAdmin);
	app.route("/admin", createAdminRouter());

	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			return err.getResponse();
		}
		console.error("[api] unhandled error:", err);
		return c.json({ error: "Internal server error" }, 500);
	});

	app.notFound((c) => c.json({ error: "Not found" }, 404));

	return app;
}
