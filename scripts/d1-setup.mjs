#!/usr/bin/env node
/**
 * D1 SETUP HELPER — list everything, create ONLY our own database.
 *
 * Lists every D1 database already in your Cloudflare account so you can see
 * exactly what exists, marking anything unprefixed DO NOT TOUCH.
 *
 * If NO database with this project's reserved prefix exists yet, it CREATES
 * one (the prefixed name from wrangler.jsonc, or you-ge-main) and wires the
 * returned uuid into wrangler.jsonc automatically — owner instruction
 * 2026-09-24: "allow writes to the D1 database, but only [ones] created by
 * this project — or create it if it doesn't exist".
 *
 * It never creates, alters, migrates, or deletes anything UNPREFIXED, and it
 * never auto-wires an EXISTING prefixed database (that stays a manual paste,
 * because existing ≠ provably ours). If you prefer the fully manual flow:
 *   npx wrangler d1 create you-ge-main   ← then paste the uuid yourself.
 *
 * Self-test (no network, no account needed):
 *   node scripts/d1-setup.mjs --self-test
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseJsonc } from "./jsonc.mjs";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep in sync with scripts/d1-safety-check.mjs and scripts/grant-admin.mjs.
// Renamed by owner instruction 2026-09-24 (prefix was "you.ge", name "you.ge-portfolio").
const DB_NAME_PREFIX = "you-ge";
const RECOMMENDED_DB_NAME = "you-ge-main";

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const SELF_TEST = process.argv.includes("--self-test");

function parseWranglerJson(stdout) {
	const text = String(stdout);
	const start = text.search(/[[{]/);
	if (start === -1) return null;
	for (let end = text.length; end > start; end--) {
		try {
			return JSON.parse(text.slice(start, end));
		} catch {
			/* keep trimming */
		}
	}
	return null;
}

/** First uuid-looking token in any wrangler output (table or JSON). */
function extractUuid(text) {
	const m = String(text).match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
	return m ? m[0].toLowerCase() : null;
}

/**
 * Replace the single `"database_id": "…"` value in wrangler.jsonc text.
 * Pure function (text → text) so --self-test can verify it. Throws when the
 * key does not appear EXACTLY once — comments never use the quoted-key-plus-
 * colon shape, so a second match means the file changed shape and a human
 * must wire the id by hand.
 */
function wireDatabaseIdIntoText(text, uuid) {
	const re = /("database_id"\s*:\s*")[^"]*(")/;
	const count = (text.match(new RegExp(re.source, "g")) ?? []).length;
	if (count !== 1) {
		throw new Error(`expected exactly one \"database_id\": \"…\" value in wrangler.jsonc, found ${count}`);
	}
	return text.replace(re, `$1${uuid}$2`);
}

function manualFallback(name, detail) {
	console.error(red(`\n  ✖ Could not create/wire ${bold(name)} automatically.`));
	console.error(dim(String(detail).split("\n").join("\n  ").slice(0, 800)));
	console.error(`\n  Do it by hand — create:`);
	console.error(`\n    ${bold(`npx wrangler d1 create ${name}`)}`);
	console.error(`\n  then paste the printed uuid into wrangler.jsonc:`);
	console.error(`\n    "database_id": "<the uuid>"\n`);
	process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Self-test: verify the pure logic with zero network access.
if (SELF_TEST) {
	const assert = (cond, label) => {
		if (!cond) {
			console.error(`  ${red(bold(`✖ ${label}`))}`);
			process.exit(1);
		}
		console.log(`  ${green("✔")} ${label}`);
	};
	const uuidA = "7823ab19-6c9d-4d20-b5f1-0a2b3c4d5e6f";
	assert(
		extractUuid(`🌀 Creating database you-ge-main\n✅ Successfully created DB\n  database_id: ${uuidA}\n  created_at: ...`) === uuidA,
		"uuid extracted from wrangler table output",
	);
	assert(extractUuid(`{"name":"you-ge-main","uuid":"${uuidA}"}`) === uuidA, "uuid extracted from JSON output");
	assert(extractUuid("no uuid in here at all") === null, "no uuid → null");
	const cfg = readFileSync(path.join(APP_DIR, "wrangler.jsonc"), "utf8");
	const wired = wireDatabaseIdIntoText(cfg, uuidA);
	assert(wired.includes(`"database_id": "${uuidA}"`), "wiring replaces the id value");
	assert(!/"database_id"\s*:\s*"REPLACE/.test(wired), "placeholder is gone from the config value");
	assert(wired.includes("you.ge — Workers Free configuration"), "comments survive the rewrite");
	assert(
		(() => { try { wireDatabaseIdIntoText(cfg + '\n"database_id": "x"', uuidA); return false; } catch { return true; } })(),
		"ambiguous config (2 matches) → refuses to rewrite",
	);
	console.log(`\n${green(bold("✔ self-test passed"))} — create/wire logic verified\n`);
	process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
console.log(`\n${bold("Existing D1 databases in your Cloudflare account")}`);
console.log(dim("  (listing is read-only; the only thing this script can ever create is the project's own prefixed database)\n"));

let dbs = [];
try {
	const stdout = execFileSync("npx", ["wrangler", "d1", "list", "--json"], {
		cwd: APP_DIR,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});
	const parsed = parseWranglerJson(stdout);
	dbs = Array.isArray(parsed) ? parsed : (parsed?.result ?? parsed?.databases ?? []);
} catch (err) {
	console.error(red(`  Could not list databases.`));
	console.error(dim(String(err.stderr ?? err.message).split("\n").join("\n  ").slice(0, 800)));
	console.error(`\n  Run ${bold("npx wrangler login")} first, then retry ${bold("npm run d1:setup")}.\n`);
	process.exit(1);
}

if (!Array.isArray(dbs) || dbs.length === 0) {
	console.log(`  ${yellow("No D1 databases exist in this account yet.")}`);
	console.log(dim("  That is the ideal starting point — nothing can be clobbered.\n"));
} else {
	const nameWidth = Math.max(...dbs.map((d) => String(d.name ?? "").length), 4);
	for (const db of dbs) {
		const name = String(db.name ?? "?");
		const uuid = String(db.uuid ?? "?");
		const marker = name.startsWith(DB_NAME_PREFIX)
			? green(" ← this project's reserved prefix")
			: yellow(" ← DO NOT TOUCH");
		console.log(`  ${name.padEnd(nameWidth)}  ${dim(uuid)}${marker}`);
	}
	console.log(
		`\n  ${yellow("⚠")}  The ${dbs.length} database(s) above are yours and are NOT used by this project.`,
	);
	console.log(dim("     Nothing in this repo reads from or writes to them.\n"));
}

// What does wrangler.jsonc currently point at?
let configured = null;
const cfgPath = path.join(APP_DIR, "wrangler.jsonc");
if (existsSync(cfgPath)) {
	// String-aware JSONC parse (see scripts/jsonc.mjs). The old
	// block-comment-then-line-comment regex order mis-read wrangler.jsonc's
	// `/api/*` and `"0 */6 * * *"` and deleted the d1_databases block, so this
	// script always reported "not configured" even when it was.
	try {
		configured = parseJsonc(readFileSync(cfgPath, "utf8"))?.d1_databases?.[0] ?? null;
	} catch {
		configured = null;
	}
}

const existingForUs = dbs.filter((d) => String(d.name ?? "").startsWith(DB_NAME_PREFIX));
const configuredCorrectly =
	configured &&
	typeof configured.database_name === "string" &&
	configured.database_name.startsWith(DB_NAME_PREFIX) &&
	configured.database_id &&
	!/REPLACE|CHANGE|YOUR_/i.test(configured.database_id);

console.log(bold("Next step"));
console.log("─".repeat(64));

if (configuredCorrectly) {
	console.log(`  ${green("✔ wrangler.jsonc is already configured correctly.")}`);
	console.log(`    database_name: ${configured.database_name}`);
	console.log(`    database_id:   ${configured.database_id}`);
	console.log(`\n  You can run ${bold("npm run db:migrate:remote")} (it re-verifies first).\n`);
	process.exit(0);
}

if (existingForUs.length > 0) {
	console.log(
		`  ${bold("A database with this project's reserved prefix already exists:")}`,
	);
	for (const d of existingForUs) {
		console.log(`\n    ${bold(d.name)}  ${dim(d.uuid)}`);
	}
	console.log(
		`\n  If YOU created ${bold(RECOMMENDED_DB_NAME)} for this project, paste its id into wrangler.jsonc:`,
	);
	console.log(`\n    "database_id": "${green(existingForUs[0].uuid)}"\n`);
	console.log(`  If you did ${bold("not")} create it for this project, pick a different name`);
	console.log(`  that still starts with "${DB_NAME_PREFIX}" by editing`);
	console.log(`  ${bold("DB_NAME_PREFIX / RECOMMENDED_DB_NAME")} in ALL of:`);
	console.log(`    scripts/d1-safety-check.mjs`);
	console.log(`    scripts/d1-setup.mjs`);
	console.log(`    scripts/grant-admin.mjs\n`);
	process.exit(0);
}

// ── No prefixed database exists, and the config is not wired ────────────────
// Owner instruction 2026-09-24: create it. Only ever the prefixed name.
const createName =
	typeof configured?.database_name === "string" &&
	configured.database_name.startsWith(DB_NAME_PREFIX)
		? configured.database_name
		: RECOMMENDED_DB_NAME;

console.log(`  No ${bold(`"${DB_NAME_PREFIX}*"`)} database exists yet — creating ${bold(createName)} for this project…\n`);

const run = (args) =>
	execFileSync("npx", ["wrangler", ...args], {
		cwd: APP_DIR,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});

// Try JSON output first. If the command SUCCEEDED we must NOT retry (the
// database now exists; a second create would fail as "already exists").
let out;
try {
	out = run(["d1", "create", createName, "--json"]);
} catch (errJson) {
	// --json may be rejected by older wranglers before any API call happens;
	// a plain retry is safe ONLY then. If it was auth/network, the retry
	// fails the same way and we surface it.
	try {
		out = run(["d1", "create", createName]);
	} catch (err) {
		manualFallback(createName, [err.stdout, err.stderr, err.message].filter(Boolean).join("\n"));
	}
}

const parsed = parseWranglerJson(out);
const uuid =
	(parsed?.uuid ?? parsed?.database_id ?? (Array.isArray(parsed) ? (parsed[0]?.uuid ?? parsed[0]?.database_id) : null)) ??
	extractUuid(out);
if (!uuid) {
	manualFallback(
		createName,
		`Created the database, but could not read its id from wrangler's output.\nRun: npx wrangler d1 info ${createName}\nRaw output:\n${out}`,
	);
}

// Wire the uuid into wrangler.jsonc (surgical, comment-preserving).
const cfgFile = path.join(APP_DIR, "wrangler.jsonc");
try {
	const before = readFileSync(cfgFile, "utf8");
	writeFileSync(cfgFile, wireDatabaseIdIntoText(before, uuid));
} catch (err) {
	manualFallback(createName, `Database created (${uuid}) but writing wrangler.jsonc failed:\n${err.message}`);
}

console.log(`  ${green("✔ created and wired:")}`);
console.log(`      "database_name": "${createName}"`);
console.log(`      "database_id":   "${uuid}"`);
console.log(dim(`      (wrangler.jsonc — the change is visible in git diff if you want to inspect it)`));
console.log(`\n  Next: ${bold("npm run db:migrate:remote")} — it re-verifies (prefix → id → ours/empty) and migrates.\n`);
