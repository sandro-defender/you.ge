#!/usr/bin/env node
/**
 * D1 SAFETY PREFLIGHT
 * ────────────────────────────────────────────────────────────────────────────
 * Refuses to let a migration touch anything except THIS project's own,
 * brand-new, empty D1 database.
 *
 * Why this exists
 *   `wrangler d1 migrations apply --remote` records applied migrations in the
 *   target database's `d1_migrations` table. If you point it at a database you
 *   already use, that table has no record of OUR migrations — so wrangler
 *   happily replays every one of them against your live data. Our first
 *   migration contains CREATE TABLE statements that would collide with, or
 *   worse, be followed by destructive statements against, existing tables.
 *
 * What it enforces, in order
 *   1. wrangler.jsonc database_name must equal EXPECTED_DB_NAME exactly.
 *   2. That name must resolve to the database_id in wrangler.jsonc.
 *   3. The target must be EMPTY — no user tables, no rows in `user`/`session`.
 *
 * Escape hatch (deliberately ugly, on purpose)
 *   node scripts/d1-safety-check.mjs --allow-non-empty
 *
 * Nothing in this file writes to, alters, or deletes any database. It runs
 * exactly one read-only SELECT against sqlite_master.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The ONLY database name this project is allowed to use.
 *
 * This is intentionally NOT a generic name like "you-ge" or "app" or "dev".
 * If you ever have to change it, change it here first — every check below is
 * driven from this constant.
 */
const EXPECTED_DB_NAME = "you-ge-portfolio";

const ALLOW_NON_EMPTY = process.argv.includes("--allow-non-empty");

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function fail(lines) {
	console.error(`\n${red(bold("✖ D1 SAFETY CHECK FAILED"))}\n`);
	for (const line of lines) console.error(`  ${line}`);
	console.error(`\n${red("No migration was run. No database was modified.")}\n`);
	process.exit(1);
}

function ok(msg) {
	console.log(`  ${green("✔")} ${msg}`);
}

/** Strip any non-JSON banner wrangler prints above/below the payload. */
function parseWranglerJson(stdout) {
	const text = String(stdout);
	const start = text.search(/[[{]/);
	if (start === -1) return null;
	for (let end = text.length; end > start; end--) {
		const slice = text.slice(start, end);
		try {
			return JSON.parse(slice);
		} catch {
			/* keep trimming */
		}
	}
	return null;
}

function wranglerJson(args) {
	const stdout = execFileSync("npx", ["wrangler", ...args, "--json"], {
		cwd: APP_DIR,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});
	return parseWranglerJson(stdout);
}

/** wrangler.jsonc allows comments and trailing commas — strip both. */
function readWranglerConfig() {
	const file = path.join(APP_DIR, "wrangler.jsonc");
	if (!existsSync(file)) {
		fail([`Missing ${bold("wrangler.jsonc")} in ${APP_DIR}`]);
	}
	const withoutComments = readFileSync(file, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
	const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
	try {
		return JSON.parse(withoutTrailingCommas);
	} catch (err) {
		fail([`Could not parse ${bold("wrangler.jsonc")}: ${err.message}`]);
	}
}

function getBinding(cfg) {
	const bindings = cfg?.d1_databases ?? [];
	if (bindings.length === 0) {
		fail([`No ${bold("d1_databases")} binding found in wrangler.jsonc.`]);
	}
	if (bindings.length > 1) {
		fail([
			`Found ${bold(bindings.length)} D1 bindings. This safety check refuses to`,
			`guess which one you mean. Keep exactly one binding in wrangler.jsonc.`,
		]);
	}
	return bindings[0];
}

// ────────────────────────────────────────────────────────────────────────────
console.log(`\n${bold("D1 safety preflight")}`);
console.log(`  expected database: ${bold(EXPECTED_DB_NAME)}\n`);

const cfg = readWranglerConfig();
const binding = getBinding(cfg);
const configuredName = binding.database_name;
const configuredId = binding.database_id;

// ── Check 1: name must match exactly ────────────────────────────────────────
if (configuredName !== EXPECTED_DB_NAME) {
	fail([
		`${bold("wrangler.jsonc")} points at database ${red(bold(`"${configuredName}"`))}.`,
		`This project may only use ${green(bold(`"${EXPECTED_DB_NAME}"`))}.`,
		``,
		`This is the guard that stops you migrating into a database you already`,
		`have. If "${configuredName}" is one of your existing databases, STOP.`,
		``,
		`To fix, create a NEW database and paste its id into wrangler.jsonc:`,
		``,
		`    ${bold(`npx wrangler d1 create ${EXPECTED_DB_NAME}`)}`,
		``,
		`Then set database_name to "${EXPECTED_DB_NAME}" and database_id to the`,
		`uuid that command prints. Run ${bold("npm run d1:list")} to see every`,
		`database already in your account so you can confirm this name is new.`,
	]);
}
ok(`database_name is "${configuredName}"`);

// ── Check 2: id must be filled in ───────────────────────────────────────────
if (!configuredId || /REPLACE|CHANGE|YOUR_|^xxx/i.test(configuredId)) {
	fail([
		`${bold("database_id")} is still a placeholder (${red(String(configuredId))}).`,
		``,
		`Run ${bold(`npx wrangler d1 create ${EXPECTED_DB_NAME}`)} and paste the`,
		`printed uuid into wrangler.jsonc.`,
	]);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configuredId)) {
	fail([
		`${bold("database_id")} does not look like a uuid: ${red(configuredId)}`,
	]);
}
ok(`database_id is a uuid (${configuredId.slice(0, 8)}…)`);

// ── Check 3: name must resolve to that exact id ─────────────────────────────
console.log(`\n  ${yellow("→")} querying your Cloudflare account (read-only)…`);
let info;
try {
	info = wranglerJson(["d1", "info", configuredName]);
} catch (err) {
	fail([
		`${bold(`wrangler d1 info ${configuredName}`)} failed.`,
		``,
		`  ${String(err.stderr ?? err.message).split("\n").join("\n  ").slice(0, 600)}`,
		``,
		`If this says you are not authenticated, run ${bold("npx wrangler login")}.`,
		`If it says the database does not exist, create it:`,
		``,
		`    ${bold(`npx wrangler d1 create ${EXPECTED_DB_NAME}`)}`,
	]);
}

const infoResult = info?.result ?? info;
const remoteName = infoResult?.name;
const remoteId = infoResult?.uuid;

if (!remoteId) {
	fail([
		`Could not read a database uuid from ${bold(`wrangler d1 info ${configuredName}`)}.`,
		`Raw output: ${JSON.stringify(info).slice(0, 400)}`,
	]);
}

// Guard against the configured NAME belonging to a different database than the
// configured ID — i.e. you renamed something, or pasted an id from elsewhere.
if (String(remoteId).toLowerCase() !== String(configuredId).toLowerCase()) {
	fail([
		`${bold("Name/id mismatch — refusing to continue.")}`,
		``,
		`  wrangler.jsonc database_name : ${configuredName}`,
		`  wrangler.jsonc database_id   : ${configuredId}`,
		`  that NAME actually resolves  : ${red(remoteId)}`,
		``,
		`The name and the id in your config point at two DIFFERENT databases.`,
		`Migrating now could hit whichever one wrangler prefers. Fix the config so`,
		`both refer to the same newly-created ${green(EXPECTED_DB_NAME)} database.`,
	]);
}
if (remoteName && remoteName !== EXPECTED_DB_NAME) {
	fail([
		`Cloudflare reports this database is named ${red(remoteName)},`,
		`not ${green(EXPECTED_DB_NAME)}. Aborting.`,
	]);
}
ok(`"${configuredName}" resolves to ${configuredId.slice(0, 8)}… as configured`);

// ── Check 4: target must be empty ───────────────────────────────────────────
let tables;
try {
	const res = wranglerJson([
		"d1",
		"execute",
		configuredName,
		"--remote",
		"--command",
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	]);
	const rows = res?.results?.[0]?.results ?? res?.result?.results ?? [];
	tables = rows.map((r) => r.name).filter(Boolean);
} catch (err) {
	fail([
		`Could not inspect the target database (read-only query failed).`,
		``,
		`  ${String(err.stderr ?? err.message).split("\n").join("\n  ").slice(0, 600)}`,
		``,
		`Refusing to migrate into a database we cannot verify is empty.`,
	]);
}

// wrangler's own bookkeeping table is expected after a first migration.
const userTables = tables.filter((t) => t !== "d1_migrations");

if (userTables.length > 0) {
	if (!ALLOW_NON_EMPTY) {
		fail([
			`${red(bold(`"${configuredName}" is NOT empty.`))} It already contains:`,
			``,
			`    ${userTables.map((t) => bold(t)).join(", ")}`,
			``,
			`This looks like an ${bold("existing database you already use")}. Migrating`,
			`into it could collide with or destroy that data, so this script stops here.`,
			``,
			`Do this instead:`,
			``,
			`  1. ${bold("npm run d1:list")}                  ← see all your databases`,
			`  2. ${bold(`npx wrangler d1 create ${EXPECTED_DB_NAME}`)}   ← make a NEW one`,
			`  3. paste the new uuid into ${bold("wrangler.jsonc")}`,
			`  4. re-run this check`,
			``,
			`If — and only if — you are certain those tables are disposable and belong`,
			`to nothing you care about, you may override with:`,
			``,
			`    ${yellow("node scripts/d1-safety-check.mjs --allow-non-empty")}`,
		]);
	}
	console.log(
		`  ${yellow("⚠")} --allow-non-empty given: proceeding despite ${userTables.length} existing table(s).`,
	);
} else {
	ok(`target is empty (${tables.length === 0 ? "no tables at all" : "only wrangler's d1_migrations"})`);
}

console.log(`\n${green(bold("✔ Safe to migrate"))} — ${bold(EXPECTED_DB_NAME)} (${configuredId.slice(0, 8)}…)\n`);
