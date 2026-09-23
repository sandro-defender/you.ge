import { isNotFound, isRedirect } from "@tanstack/react-router";

/**
 * Sanitising loader wrapper (R6 — security).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * TanStack Router/Start (verified against installed 1.170/1.168) serialises a
 * FAILED loader's error into the dehydrated router state via seroval's
 * ShallowErrorPlugin: `new Error(<message>)` lands in a <script> in the 500
 * body. There is no errorSerializer hook in this version, so a raw Drizzle/D1
 * error would ship its SQL (and bound parameters) to any browser. Probe:
 * throw new Error("secret-token /path/to/secret.sql") in a loader → the 500
 * body contained exactly that string, in the PRODUCTION build.
 *
 * This wrapper moves the details to `console.error` (wrangler tail /
 * observability) and re-throws a generic Error, whose message is safe to
 * serialize. Redirect and notFound control-flow objects are re-thrown
 * untouched — sanitising those would break navigation.
 *
 * RULE: every route `loader` must be wrapped in this. A loader that is not
 * wrapped is a leak vector; the errorComponent never renders error.message,
 * so nothing user-facing is lost. Server functions (createServerFn) are a
 * separate, already-guarded path — getServerSession catches internally and
 * returns null.
 */
export function safeLoader<T>(fn: () => Promise<T>): () => Promise<T> {
	return async () => {
		try {
			return await fn();
		} catch (err) {
			// Control flow, not a failure — let the router handle it.
			if (isRedirect(err) || isNotFound(err)) throw err;

			console.error("[loader] failed (details sanitised for the client):", err);
			throw new Error("This page failed to load. The details are in the server logs.");
		}
	};
}
