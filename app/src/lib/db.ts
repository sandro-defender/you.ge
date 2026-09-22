import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export type Database = DrizzleD1Database<typeof schema>;

/**
 * Wrap the D1 binding in Drizzle.
 *
 * There is no connection pool, no TLS handshake, and no driver to configure —
 * D1 is a Workers binding, so this is a cheap synchronous wrapper. It is safe
 * (and normal) to call once per request.
 *
 * IMPORTANT: create ONE instance per request and share it. Two Drizzle wrappers
 * around the same binding fight over SQLite's write lock under `wrangler dev`,
 * which shows up as confusing "database is locked" errors locally only.
 */
export function createDb(d1: D1Database): Database {
	return drizzle(d1, { schema });
}
