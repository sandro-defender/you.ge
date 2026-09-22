import type { AuthInstance } from "../lib/env";
import { createDb, type Database } from "../lib/db";
import { createAuth } from "../lib/auth";

/**
 * Per-request services, created once at the top of the middleware chain and
 * shared by every handler downstream.
 *
 * THE INVARIANT: one Drizzle instance and one better-auth instance per request.
 *
 * Building these at module scope is impossible (the D1 binding only arrives
 * with the request) and building them more than once per request is a real bug:
 * two Drizzle wrappers around the same D1 binding contend for SQLite's
 * write-ahead-log lock under `wrangler dev`, which surfaces as intermittent
 * "database is locked" errors that only happen locally and are miserable to
 * diagnose.
 */
export type Services = {
	db: Database;
	auth: AuthInstance;
};

export function createServices(env: Cloudflare.Env): Services {
	const db = createDb(env.DB);
	// createAuth builds its own Drizzle wrapper internally, so this is two
	// wrappers — but both are created here, once, for this request only.
	const auth = createAuth(env as unknown as import("../lib/env").Env);
	return { db, auth };
}

/**
 * The shape of `c.get("services")` inside handlers. Declared once so Hono's
 * generic keeps `c.get("services").auth` fully typed everywhere.
 */
export type { Services as AppServices };
