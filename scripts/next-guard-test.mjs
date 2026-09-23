#!/usr/bin/env node
/**
 * Open-redirect guard test for the `?next=` post-login flow (R4 item 4).
 *
 * Two halves:
 *
 *   1. UNIT — imports `sanitiseNext` straight from src/lib/next.ts (Node ≥22.18
 *      strips erasable TS syntax natively, no tsx/esbuild needed — that is why
 *      the function had to move out of login.tsx into a dependency-free leaf)
 *      and runs an attack-table of absolute / protocol-relative / backslash
 *      payloads. Everything not a safe same-origin path must fall back to
 *      "/projects".
 *
 *   2. HTTP (runs only if the dev server is reachable on BASE) — the
 *      "curl check": /login must render 200 for hostile `next` values (never
 *      redirect off-origin), and the server-side 302 from a gated path must
 *      preserve the destination as an encoded same-origin path.
 *
 * Usage:
 *   node scripts/next-guard-test.mjs            # unit tests (+ HTTP if server up)
 *   node scripts/next-guard-test.mjs --strict   # HTTP checks REQUIRED (exit 1 if
 *                                               #  the server is not reachable)
 * Local dev only — never touches a remote database.
 */
import { sanitiseNext } from "../src/lib/next.ts";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const strict = process.argv.includes("--strict");

let pass = 0;
let fail = 0;

function check(desc, actual, want) {
	const ok = actual === want;
	if (ok) {
		pass += 1;
		console.log(`PASS  ${desc}`);
	} else {
		fail += 1;
		console.log(`FAIL  ${desc} (want=${JSON.stringify(want)} got=${JSON.stringify(actual)})`);
	}
}

console.log("── unit: sanitiseNext ──");
// [description, input, expected]
const cases = [
	["no value → default", undefined, "/projects"],
	["empty string → default", "", "/projects"],
	["plain path kept", "/projects", "/projects"],
	["path with query kept (server.ts generates this shape)", "/projects?tab=1", "/projects?tab=1"],
	["admin path kept (gate still applies later)", "/admin/users", "/admin/users"],
	["absolute https URL rejected", "https://evil.tld/phish", "/projects"],
	["absolute http URL rejected", "http://evil.tld", "/projects"],
	["protocol-relative URL rejected", "//evil.tld", "/projects"],
	["leading backslash rejected", "\\/evil.tld", "/projects"],
	["embedded backslash rejected (browser \\→/ normalisation)", "/projects\\@evil.tld", "/projects"],
	["trailing backslash rejected", "/projects\\", "/projects"],
	["scheme-relative no-slash rejected", "github.com/sandro", "/projects"],
	["javascript: URI rejected", "javascript:alert(1)", "/projects"],
	["data: URI rejected", "data:text/html,hi", "/projects"],
	["leading space rejected", "  /projects", "/projects"],
	["path that merely starts like a URL is still same-origin", "/https://evil.tld", "/https://evil.tld"],
];
for (const [desc, input, want] of cases) {
	check(desc, sanitiseNext(input), want);
}

// ── HTTP half ───────────────────────────────────────────────────────────────
console.log("── http: /login?next=… and gate redirects ──");

async function probe() {
	try {
		const res = await fetch(`${BASE}/login`, { redirect: "manual" });
		return res.ok;
	} catch {
		return false;
	}
}

const serverUp = await probe();
if (!serverUp) {
	if (strict) {
		console.error(`FAIL  dev server not reachable at ${BASE} (--strict)`);
		process.exit(1);
	}
	console.log(`SKIP  dev server not reachable at ${BASE} — start \`npx vite dev\` for the HTTP checks`);
}

if (serverUp) {
	// The login page must render (200) for every hostile next value: the
	// sanitiser only runs when the Google button is clicked, so at render time
	// the worst case is a page — never a redirect to an attacker origin.
	const hostile = [
		["https://evil.tld/phish", "https%3A%2F%2Fevil.tld%2Fphish"],
		["//evil.tld", "%2F%2Fevil.tld"],
		["\\/evil.tld", "%5C%2Fevil.tld"],
		["javascript:alert(1)", "javascript%3Aalert(1)"],
	];
	for (const [raw, encoded] of hostile) {
		const res = await fetch(`${BASE}/login?next=${encoded}`, { redirect: "manual" });
		const body = await res.text();
		check(
			`GET /login?next=${raw} → 200 page, no off-origin redirect`,
			`${res.status}|${res.headers.get("location") ?? ""}|${body.includes("Sign in")}`,
			"200||true",
		);
	}

	// A well-formed next must survive to the rendered page untouched.
	{
		const res = await fetch(`${BASE}/login?next=%2Fprojects`, { redirect: "manual" });
		check(
			"GET /login?next=/projects → 200 page",
			`${res.status}|${(await res.text()).includes("Sign in")}`,
			"200|true",
		);
	}

	// The server-side 302 from a gated path is what CREATES next — it must be
	// an encoded same-origin path on OUR /login, nothing else. (Response.redirect
	// yields an absolute URL, so compare origin-normalised path+search.)
	{
		const res = await fetch(`${BASE}/projects?tab=2`, { redirect: "manual" });
		const loc = res.headers.get("location") ?? "";
		const here = loc ? new URL(loc).pathname + new URL(loc).search : "";
		check(
			"GET /projects (no session) → 302 to our /login with encoded next",
			`${res.status}|${here}|${new URL(loc || BASE).origin === new URL(BASE).origin}`,
			"302|/login?next=%2Fprojects%3Ftab%3D2|true",
		);
	}
}

console.log("");
console.log(`NEXT GUARD: pass=${pass} fail=${fail}${serverUp ? "" : " (http skipped)"}`);
process.exit(fail === 0 ? 0 : 1);
