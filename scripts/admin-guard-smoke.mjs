#!/usr/bin/env node
/**
 * LOCAL-ONLY HTTP regression suite for the admin mutation guards.
 *
 * Covers both write paths that can change a user's role or ban state:
 *   - the admin UI's own endpoint, PATCH /api/admin/users/:id (Hono), and
 *   - better-auth's admin plugin, POST /api/auth/admin/* (guarded by the
 *     `databaseHooks.user.update.before` last-admin hook in src/lib/auth.ts).
 *
 * Unlike role-matrix-smoke.sh (read-only), this suite CHANGES fixture state,
 * so it re-seeds the local Miniflare D1 before every scenario and once more
 * at the end (even on failure). Every database write goes through
 * `wrangler d1 execute DB --local` — this script never passes --remote.
 *
 * Requires: dev server on BASE (default http://127.0.0.1:3000), `.dev.vars`
 * with BETTER_AUTH_SECRET, and local migrations (`npm run db:migrate:local`).
 *
 * Usage: node scripts/admin-guard-smoke.mjs
 */
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = path.join(APP_DIR, "scripts", "seed-local-test-users.mjs");
const TMP_SQL = path.join(os.tmpdir(), `admin-guard-seed-${process.pid}.sql`);
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

const ADMIN_ID = "test-admin-0001";
const SECOND_ID = "test-user-0001"; // promoted to admin where a scenario needs two

let pass = 0;
let fail = 0;

function reseed(extraSql = "") {
	const seedSql = execFileSync(process.execPath, [SEED], { cwd: APP_DIR, encoding: "utf8" });
	writeFileSync(TMP_SQL, `${seedSql}\n${extraSql}\n`);
	execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file", TMP_SQL], {
		cwd: APP_DIR,
		stdio: "pipe",
		env: { ...process.env, CI: "1" },
	});
}

function loadCookies() {
	const lines = execFileSync(process.execPath, [SEED, "--cookies"], { cwd: APP_DIR, encoding: "utf8" });
	return Object.fromEntries(
		lines
			.trim()
			.split("\n")
			.map((line) => {
				const at = line.indexOf("|");
				return [line.slice(0, at), line.slice(at + 1)];
			}),
	);
}

async function call(method, pathname, { cookie, body } = {}) {
	const headers = { Accept: "application/json" };
	if (cookie) headers.Cookie = cookie;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	// Browsers send Origin on every same-origin non-GET request, and
	// better-auth's CSRF check rejects a POST without one — omitting it would
	// make better-auth rows pass or fail for the wrong reason.
	if (method !== "GET") headers.Origin = BASE;
	const res = await fetch(`${BASE}${pathname}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: "manual",
	});
	return { status: res.status, text: await res.text() };
}

function expect(desc, res, wantStatus, pattern) {
	const ok = res.status === wantStatus && (!pattern || pattern.test(res.text));
	if (ok) {
		console.log(`PASS  ${desc} (${res.status})`);
		pass += 1;
	} else {
		console.log(
			`FAIL  ${desc} (want=${wantStatus}${pattern ? ` match=${pattern}` : ""} got=${res.status} body=${res.text.slice(0, 160)})`,
		);
		fail += 1;
	}
}

async function promoteSecondAdmin(cookies) {
	const res = await call("PATCH", `/api/admin/users/${SECOND_ID}`, {
		cookie: cookies.admin,
		body: { role: "admin" },
	});
	expect("setup: promote a second admin", res, 200);
}

async function main() {
	const health = await fetch(`${BASE}/api/health`).catch(() => null);
	if (!health?.ok) {
		console.error(`Dev server not reachable at ${BASE} — start it first (npx vite dev --port 3000).`);
		process.exit(2);
	}
	const cookies = loadCookies();

	console.log("── custom API: an admin cannot suspend their own account ──");
	reseed();
	await promoteSecondAdmin(cookies);
	expect(
		"admin PATCH self {banned:true} → 400",
		await call("PATCH", `/api/admin/users/${ADMIN_ID}`, { cookie: cookies.admin, body: { banned: true } }),
		400,
		/own account/i,
	);
	expect(
		"admin still has dashboard access afterwards",
		await call("GET", "/api/admin/repos", { cookie: cookies.admin }),
		200,
	);

	console.log("── custom API: suspending a user revokes their sessions ──");
	reseed();
	await promoteSecondAdmin(cookies);
	expect(
		"admin suspends the second admin → 200",
		await call("PATCH", `/api/admin/users/${SECOND_ID}`, { cookie: cookies.admin, body: { banned: true } }),
		200,
	);
	expect(
		"suspended admin's session is gone (get-session → null)",
		await call("GET", "/api/auth/get-session", { cookie: cookies.user }),
		200,
		/^null$/,
	);
	// The exploit this closes: better-auth's admin middleware validates the
	// session but never looks at `banned`, so a surviving session let a
	// suspended admin unban themselves through better-auth's own endpoint.
	expect(
		"suspended admin cannot call better-auth unban-user on themselves → 401",
		await call("POST", "/api/auth/admin/unban-user", { cookie: cookies.user, body: { userId: SECOND_ID } }),
		401,
	);

	console.log("── custom API: comma-separated roles still count as admin ──");
	reseed(`UPDATE user SET role='admin,member' WHERE id='${ADMIN_ID}';`);
	expect(
		"role 'admin,member' passes the admin API guard",
		await call("GET", "/api/admin/repos", { cookie: cookies.admin }),
		200,
	);
	expect(
		"sole admin with role 'admin,member' cannot demote themselves → 400",
		await call("PATCH", `/api/admin/users/${ADMIN_ID}`, { cookie: cookies.admin, body: { role: "member" } }),
		400,
		/final administrator/i,
	);

	console.log("── better-auth set-role: last-admin hook understands comma roles ──");
	reseed();
	expect(
		"sole admin set-role ['admin','member'] is not a demotion → 200",
		await call("POST", "/api/auth/admin/set-role", {
			cookie: cookies.admin,
			body: { userId: ADMIN_ID, role: ["admin", "member"] },
		}),
		200,
	);
	reseed(`UPDATE user SET role='admin,member' WHERE id='${ADMIN_ID}';`);
	expect(
		"sole admin with role 'admin,member' set-role 'user' → 400",
		await call("POST", "/api/auth/admin/set-role", {
			cookie: cookies.admin,
			body: { userId: ADMIN_ID, role: "user" },
		}),
		400,
		/last administrator/i,
	);
	reseed();
	expect(
		"sole admin set-role 'member' → 400 (existing guard still holds)",
		await call("POST", "/api/auth/admin/set-role", {
			cookie: cookies.admin,
			body: { userId: ADMIN_ID, role: "member" },
		}),
		400,
		/last administrator/i,
	);
}

try {
	await main();
} finally {
	// Restore fixture truth so role-matrix-smoke.sh keeps passing afterwards.
	try {
		reseed();
	} finally {
		rmSync(TMP_SQL, { force: true });
	}
}

console.log(`\nADMIN GUARDS: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
