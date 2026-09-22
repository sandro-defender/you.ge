#!/usr/bin/env node
/**
 * LOCAL-ONLY test fixture: seeds three users + sessions into the Miniflare
 * SQLite D1 (wrangler --local) and prints signed session cookies for each.
 *
 * NEVER run anything with --remote. This script only generates SQL + cookies;
 * applying them is done by `wrangler d1 execute you-ge-portfolio --local`.
 *
 * Cookies are signed exactly the way better-auth/hono serialize signed
 * cookies (verified against installed hono/dist/utils/cookie.js):
 *   value = encodeURIComponent(token + "." + base64(HMAC-SHA256(secret, token)))
 * with cookie name better-auth.session_token (no __Secure- prefix on http).
 * The secret comes from .dev.vars — same file the dev server reads.
 *
 * Usage:
 *   node scripts/seed-local-test-users.mjs > /tmp/seed.sql          # SQL
 *   node scripts/seed-local-test-users.mjs --cookies               # cookie header lines
 *   npx wrangler d1 execute you-ge-portfolio --local --file /tmp/seed.sql
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretLine = readFileSync(path.join(APP_DIR, ".dev.vars"), "utf8").match(
	/^BETTER_AUTH_SECRET=(.*)$/m,
);
if (!secretLine) {
	console.error("Missing BETTER_AUTH_SECRET in .dev.vars (copy .dev.vars.example).");
	process.exit(1);
}
const secret = secretLine[1].trim();
const cookiesMode = process.argv.includes("--cookies");

const now = Date.now();
const in7d = now + 7 * 24 * 3600 * 1000;
const users = [
	{ id: "test-user-0001", email: "plainuser@test.local", name: "Plain User", role: "user" },
	{ id: "test-member-0001", email: "memberuser@test.local", name: "Member User", role: "member" },
	{ id: "test-admin-0001", email: "adminuser@test.local", name: "Admin User", role: "admin" },
];

const sql = [];
const cookieLines = [];
// Remove any previous (stale/random-token) sessions for the fixture users so
// re-runs stay idempotent; the users themselves are INSERT OR IGNORE'd.
for (const u of users) {
	sql.push(`DELETE FROM session WHERE user_id = '${u.id}';`);
}
for (const u of users) {
	sql.push(
		`INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role, banned, ban_reason, ban_expires) VALUES ('${u.id}', '${u.name}', '${u.email}', 1, NULL, ${now}, ${now}, '${u.role}', 0, NULL, NULL);`,
	);
	// Deterministic token: `--cookies` must reproduce the SAME token the SQL
	// inserted (a random token here made every later cookie run point at a
	// row that never existed — sessions then validate as null).
	const token =
		`testtoken-${u.role}-` +
		createHash("sha256").update(u.id).digest("hex").slice(0, 24);
	sql.push(
		`INSERT OR IGNORE INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id, impersonated_by) VALUES ('${randomUUID()}', ${in7d}, '${token}', ${now}, ${now}, '127.0.0.1', 'seed-local-test-users', '${u.id}', NULL);`,
	);
	const sig = createHmac("sha256", secret).update(token).digest("base64");
	const cookieVal = encodeURIComponent(`${token}.${sig}`);
	cookieLines.push(`${u.role}|better-auth.session_token=${cookieVal}`);
}

if (cookiesMode) {
	console.log(cookieLines.join("\n"));
} else {
	console.log(sql.join("\n"));
}
