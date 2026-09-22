#!/usr/bin/env node
/**
 * GRANT (OR REVOKE) A ROLE FOR AN ALREADY-SIGNED-IN USER — admin bootstrap.
 * ────────────────────────────────────────────────────────────────────────────
 * This replaces `better-auth` CLI's `create-admin`, which CANNOT work in this
 * project (verified against the installed auth@1.7.5 CLI — see HANDOVER §7):
 *   1. its getConfig() requires a default-exported `auth` instance (or a
 *      variable named `auth`); src/lib/auth.ts exports a `createAuth(env)`
 *      factory, so the CLI fails with "Couldn't read your auth config", and
 *   2. even with an instance, it would write through the better-auth adapter
 *      — which here is Drizzle over a D1 binding. A Node process has no D1
 *      binding (`env.DB` only exists inside the Worker runtime), so it can
 *      never reach local OR remote D1.
 *
 * The Google-only sign-in flow creates the `user` row on first login. Promoting
 * that row is exactly what better-auth's own setRole does under the hood
 * (verified in §4b: "setRole REPLACES the role column" — a plain UPDATE on
 * user.role). This script runs that UPDATE through `wrangler d1 execute`, the
 * only bridge to a remote D1 database.
 *
 * Safety (same non-negotiable rule as scripts/d1-safety-check.mjs):
 *   - the configured database_name must start with the prefix "you.ge";
 *   - refuses to run otherwise. It never touches any other database.
 * The target is EXPECTED to be non-empty here (it holds the signed-in user);
 * the empty check belongs to the one-time first migration only.
 *
 * Usage:
 *   node scripts/grant-admin.mjs you@example.com              # role=admin, remote
 *   node scripts/grant-admin.mjs --role member you@example.com
 *   node scripts/grant-admin.mjs --local you@example.com      # local Miniflare
 *
 * The role column REPLACES (like setRole): pass --role user to revoke back.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseJsonc } from "./jsonc.mjs";

// Keep in sync with scripts/d1-safety-check.mjs and scripts/d1-setup.mjs.
const DB_NAME_PREFIX = "you.ge";

const argv = process.argv.slice(2);
const LOCAL = argv.includes("--local");
const roleIdx = argv.indexOf("--role");
const role = roleIdx === -1 ? "admin" : (argv[roleIdx + 1] ?? "");
const positional = argv.filter(
	(a, i) => a !== "--local" && a !== "--role" && (roleIdx === -1 || i !== roleIdx + 1),
);
const email = positional[positional.length - 1] ?? "";

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function fail(lines) {
	console.error(`\n${red(bold("✖ grant-admin refused to run"))}\n`);
	for (const line of lines) console.error(`  ${line}`);
	console.error();
	process.exit(1);
}

if (!/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email)) {
	fail([
		`Expected an email address as the argument, got: ${red(JSON.stringify(email))}`,
		``,
		`  node scripts/grant-admin.mjs you@example.com`,
	]);
}
if (!["admin", "member", "user"].includes(role)) {
	fail([
		`--role must be one of ${bold("admin")}, ${bold("member")}, ${bold("user")} (got ${red(JSON.stringify(role))}).`,
		`These are the roles validated by siteRoles — see src/lib/auth-roles.ts.`,
	]);
}

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfgFile = path.join(APP_DIR, "wrangler.jsonc");
if (!existsSync(cfgFile)) fail([`Missing ${bold("wrangler.jsonc")} in ${APP_DIR}`]);

let binding;
try {
	binding = (parseJsonc(readFileSync(cfgFile, "utf8"))?.d1_databases ?? [])[0] ?? null;
} catch (err) {
	fail([`Could not parse wrangler.jsonc: ${err.message}`]);
}
const name = binding?.database_name;
if (typeof name !== "string" || !name.startsWith(DB_NAME_PREFIX)) {
	fail([
		`wrangler.jsonc database_name is ${red(bold(`"${name}"`))}.`,
		`This project may only touch a database whose name starts with ${green(bold(`"${DB_NAME_PREFIX}"`))}.`,
		`See scripts/d1-safety-check.mjs for the full policy.`,
	]);
}

const where = `lower(email) = lower('${email.replace(/'/g, "''")}')`;
const cmd = LOCAL ? "--local" : "--remote";
console.log(`\n${bold("grant-admin")} — ${bold(name)} (${cmd})`);
console.log(`  UPDATE user SET role = '${role}' WHERE ${where}\n`);

const exec = (command) =>
	execFileSync("npx", ["wrangler", "d1", "execute", name, cmd, "--command", command, "--json"], {
		cwd: APP_DIR,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});

try {
	exec(`UPDATE user SET role = '${role}', updated_at = ${Date.now()} WHERE ${where}`);
	const res = JSON.parse(exec(`SELECT id, name, email, role, banned FROM user WHERE ${where}`));
	// wrangler 4 `d1 execute --json` → [ { "results": [...], "success": true } ]
	// (runtime-verified). Unknown envelopes abort — never report a parse miss
	// as "no user row".
	const entry = Array.isArray(res) ? res[0] : res;
	const rows = entry?.results ?? (Array.isArray(entry?.result) ? entry.result[0]?.results : entry?.result?.results);
	if (!Array.isArray(rows)) {
		fail([
			`Could not interpret wrangler's --json output (unrecognised envelope):`,
			`  ${JSON.stringify(res).slice(0, 400)}`,
		]);
	}
	if (rows.length === 0) {
		fail([
			`No user row with email ${bold(email)} exists in ${bold(name)} yet.`,
			``,
			`The row is created by the first real Google sign-in. Have the owner sign`,
			`in once, then re-run this command (HANDOVER §6 R2).`,
		]);
	}
	for (const r of rows) {
		console.log(`  ${green("✔")} ${r.email}  role=${bold(r.role)}  banned=${r.banned ? 1 : 0}  id=${r.id}`);
	}
	console.log(`\n${green(bold("✔ done"))} — role replaced (setRole semantics) on ${bold(name)}.\n`);
} catch (err) {
	fail([
		`wrangler d1 execute failed.`,
		``,
		`  ${String(err.stderr ?? err.message).split("\n").join("\n  ").slice(0, 600)}`,
		``,
		`If this says you are not authenticated, run ${bold("npx wrangler login")}.`,
	]);
}
