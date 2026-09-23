#!/usr/bin/env node
/**
 * LOCAL-ONLY test fixture: seeds three users + sessions into the Miniflare
 * SQLite D1 (wrangler --local) and prints signed session cookies for each.
 *
 * NEVER run anything with --remote. This script only generates SQL + cookies;
 * applying them is done by `wrangler d1 execute DB --local --file /tmp/seed.sql`
 * (`DB` = the binding name in wrangler.jsonc — wrangler resolves a name OR a
 * binding, and passing the binding can never drift from the configured DB).
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
 *   npx wrangler d1 execute DB --local --file /tmp/seed.sql
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
// `key` drives the deterministic token + the --cookies label; `role` is what
// lands in user.role. R6 fixtures: expired (valid member role, DEAD session),
// banned (member role + banned flag), garbage (role string that matches
// nothing — proves hasRole fails closed over HTTP too).
const users = [
	{ id: "test-user-0001", email: "plainuser@test.local", name: "Plain User", role: "user", key: "user", expiresAt: in7d },
	{ id: "test-member-0001", email: "memberuser@test.local", name: "Member User", role: "member", key: "member", expiresAt: in7d },
	{ id: "test-admin-0001", email: "adminuser@test.local", name: "Admin User", role: "admin", key: "admin", expiresAt: in7d },
	{ id: "test-expired-0001", email: "expiredmember@test.local", name: "Expired Member", role: "member", key: "expired", expiresAt: now - 3600 * 1000 },
	{ id: "test-banned-0001", email: "bannedmember@test.local", name: "Banned Member", role: "member", key: "banned", expiresAt: in7d, banned: 1, banReason: "Banned by test fixture." },
	{ id: "test-garbage-0001", email: "garbagerole@test.local", name: "Garbage Role", role: "garbage", key: "garbage", expiresAt: in7d },
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
		`INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at, role, banned, ban_reason, ban_expires) VALUES ('${u.id}', '${u.name}', '${u.email}', 1, NULL, ${now}, ${now}, '${u.role}', ${u.banned ?? 0}, ${u.banReason ? `'${u.banReason}'` : "NULL"}, NULL);`,
	);
	// OR IGNORE above leaves an EXISTING row untouched — force role/ban state
	// back to fixture truth so re-runs self-heal after E2E experiments
	// (R5 lesson: set-role/ban tests drift the DB and later matrix runs fail).
	sql.push(
		`UPDATE user SET role='${u.role}', banned=${u.banned ?? 0}, ban_reason=${u.banReason ? `'${u.banReason}'` : "NULL"}, updated_at=${now} WHERE id='${u.id}';`,
	);
	// Deterministic token: `--cookies` must reproduce the SAME token the SQL
	// inserted (a random token here made every later cookie run point at a
	// row that never existed — sessions then validate as null).
	const token =
		`testtoken-${u.key}-` +
		createHash("sha256").update(u.id).digest("hex").slice(0, 24);
	sql.push(
		`INSERT OR IGNORE INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id, impersonated_by) VALUES ('${randomUUID()}', ${u.expiresAt}, '${token}', ${now}, ${now}, '127.0.0.1', 'seed-local-test-users', '${u.id}', NULL);`,
	);
	const sig = createHmac("sha256", secret).update(token).digest("base64");
	const cookieVal = encodeURIComponent(`${token}.${sig}`);
	cookieLines.push(`${u.key}|better-auth.session_token=${cookieVal}`);
}

if (cookiesMode) {
	console.log(cookieLines.join("\n"));
} else {
	console.log(sql.join("\n"));
}
