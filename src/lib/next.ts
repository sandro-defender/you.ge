/**
 * Open-redirect guard for the `?next=` post-login flow.
 *
 * WHY THIS IS A LEAF MODULE
 * `sanitiseNext` used to live inline in `src/routes/login.tsx`. R4 asked for a
 * unit-style check of the guard (HANDOVER §6 R4 item 4); testing it requires
 * importing it from a plain Node script (`scripts/next-guard-test.mjs`, run
 * via Node's type stripping), so the function moved to a dependency-free leaf
 * that both the route and the script can import. Keep this file import-free:
 * anything heavier and the Node test stops being a pure unit test.
 */

/**
 * Accept only a same-origin relative path; everything else falls back to
 * /projects. Rejects protocol-relative URLs ("//evil.tld") too, which browsers
 * treat as absolute, and backslashes (a browser may normalise `\` to `/`,
 * letting "\/evil.tld" style bypasses through a naive `/`-prefix check).
 *
 * This runs on the value straight from the URL search params, i.e. fully
 * attacker-controllable: /login?next=https://evil.tld must never bounce a
 * freshly-authenticated user to a hostile origin right after they sign in —
 * that is the textbook post-auth open-redirect phishing flow.
 *
 * A leading "/." or "/\\" is not rejected: the router resolves the path
 * against the current origin client-side, and `\` anywhere is already fatal,
 * so there is no traversal to protect here — only the origin.
 */
export function sanitiseNext(next: string | undefined): string {
	if (!next) return "/projects";
	if (!next.startsWith("/")) return "/projects";
	if (next.startsWith("//")) return "/projects";
	if (next.includes("\\")) return "/projects";
	return next;
}
