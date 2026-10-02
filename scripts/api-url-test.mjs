#!/usr/bin/env node
// Regression guard: OAuth callbacks must retain Google's state query parameter
// while the Worker strips only the /api prefix for Hono.
import { apiRequestUrl } from "../src/lib/api-url.ts";

const input = new URL(
	"https://you.ge/api/auth/callback/google?code=google-code&state=csrf-state",
);
const actual = apiRequestUrl(input).toString();
const expected = "https://you.ge/auth/callback/google?code=google-code&state=csrf-state";

if (actual !== expected) {
	console.error(`FAIL OAuth callback query preservation: want=${expected} got=${actual}`);
	process.exit(1);
}

console.log("PASS OAuth callback query preservation");
