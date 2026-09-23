#!/usr/bin/env node
/**
 * D1 SETUP HELPER — strictly read-only.
 *
 * Lists every D1 database already in your Cloudflare account so you can see
 * exactly what exists BEFORE you create anything, then prints the one command
 * you need to run to create this project's own database.
 *
 * This script never creates, alters, migrates, or deletes a database. It runs
 * `wrangler d1 list` and nothing else. The `create` command is printed for YOU
 * to run, so that creating a database is always a deliberate human action.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
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

console.log(`\n${bold("Existing D1 databases in your Cloudflare account")}`);
console.log(dim("  (read-only listing — nothing here is created or modified)\n"));

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

console.log(`  Create a NEW database dedicated to this project:`);
console.log(`\n    ${bold(green(`npx wrangler d1 create ${RECOMMENDED_DB_NAME}`))}\n`);
console.log(`  It prints a database_id. Paste that into ${bold("wrangler.jsonc")}:`);
console.log(`\n    "d1_databases": [{`);
console.log(`      "binding":       "DB",`);
console.log(`      "database_name": "${RECOMMENDED_DB_NAME}",`);
console.log(`      "database_id":   "${green("<paste the uuid here>")}"`);
console.log(`    }]`);
console.log(`\n  Then run ${bold("npm run db:migrate:remote")}.`);
console.log(
	dim(`  That command runs scripts/d1-safety-check.mjs first and will refuse to`),
);
console.log(
	dim(`  proceed unless the target starts with "${DB_NAME_PREFIX}" and is completely empty.\n`),
);
