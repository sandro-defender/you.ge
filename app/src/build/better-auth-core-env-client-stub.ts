/**
 * Browser-safe replacement for `@better-auth/core/env` — CLIENT BUNDLE ONLY.
 *
 * Wired up by the `youge:better-auth-env-client-stub` plugin in vite.config.ts,
 * which resolves `@better-auth/core/env` to this file exclusively when
 * `this.environment.name === "client"`. The SSR/Worker build still gets the
 * real module (server code relies on it for logging levels, NODE_ENV, …).
 *
 * ── WHY THIS EXISTS (verified against better-auth 1.7.5's own dist) ──────────
 * `createAuthClient()` → `client/config.mjs` → `../utils/url.mjs` →
 * `@better-auth/core/env`. The real module's top level contains an
 *   Object.freeze({ get <SECRET_NAME>() {…}, … }) object whose getters name
 *   better-auth's secrets (the §5-forbidden literal is the signing-secret
 *   env var name — deliberately not written here).
 * — `Object.freeze(...)` is an unannotated call, so tree-shaking keeps it even
 * though nothing on the client reads it. That is exactly the leak HANDOVER §5
 * forbids: secret NAME accessors shipping to the browser.
 *
 * Only `{ env }` is imported by client-reachable code (utils/url.mjs reads
 * BETTER_AUTH_URL / NEXT_PUBLIC_* / BASE_URL for base-URL inference). The other
 * exports are provided with the values the REAL module produces in a browser
 * (no `process`, no Deno, no Bun → fallbacks), so behavior is identical:
 *
 *   real env proxy  → reads globalThis (window) in a browser
 *   real getEnvVar  → returns the fallback when process/Deno/Bun are absent
 *   real nodeENV    → env.NODE_ENV ?? "" → "" in a browser
 *
 * Do NOT add secret-name getters here, and do NOT reuse this file on the
 * server — the §5 leak check greps dist/client for better-auth's signing
 * secret env-var name (see the HANDOVER §5 list; not written here either).
 */

const _envShim: Record<string, unknown> = Object.create(null);

type BrowserGlobals = {
	process?: { env?: Record<string, unknown> };
	Deno?: { env?: { toObject?(): Record<string, unknown> } };
	__env__?: Record<string, unknown>;
};

/** Mirror of better-auth's env proxy: browser reads fall through to globalThis. */
function _getEnv(useShim?: boolean): Record<string, unknown> {
	const g = globalThis as unknown as BrowserGlobals;
	const fromProcess = g.process?.env;
	if (fromProcess) return fromProcess;
	const fromDeno = g.Deno?.env?.toObject?.();
	if (fromDeno) return fromDeno;
	const fromGlobal = g.__env__;
	if (fromGlobal) return fromGlobal;
	if (useShim) return _envShim;
	return globalThis as unknown as Record<string, unknown>;
}

export const env: Record<string, unknown> = new Proxy(_envShim, {
	get(_, prop) {
		return _getEnv()[prop as string] ?? _envShim[prop as string];
	},
	has(_, prop) {
		return prop in _getEnv() || prop in _envShim;
	},
	set(_, prop, value) {
		_getEnv(true)[prop as string] = value;
		return true;
	},
	deleteProperty(_, prop) {
		delete _getEnv(true)[prop as string];
		return true;
	},
	ownKeys() {
		return Object.keys(_getEnv(true));
	},
});

/** Same contract as better-auth's getEnvVar: no runtime env → fallback. */
export function getEnvVar(key: string, fallback?: string): string | undefined {
	const g = globalThis as {
		process?: { env?: Record<string, string | undefined> };
		Deno?: { env?: { get(k: string): string | undefined } };
		Bun?: { env?: Record<string, string | undefined> };
	};
	if (typeof g.process !== "undefined" && g.process?.env) return g.process.env[key] ?? fallback;
	if (typeof g.Deno !== "undefined") return g.Deno.env?.get(key) ?? fallback;
	if (typeof g.Bun !== "undefined") return g.Bun.env?.[key] ?? fallback;
	return fallback;
}

export function getBooleanEnvVar(key: string, fallback = true): boolean {
	const value = getEnvVar(key);
	if (!value) return fallback;
	return value !== "0" && value.toLowerCase() !== "false" && value !== "";
}

export const nodeENV = (env.NODE_ENV as string | undefined) ?? "";
export const isProduction = nodeENV === "production";
export const isDevelopment = (): boolean => nodeENV === "dev" || nodeENV === "development";
export const isTest = nodeENV === "test" || getBooleanEnvVar("TEST", false);

/**
 * Deliberately NOT exported: the real module's `ENV` object — it is the thing
 * that carries the secret-name getters (`get <SIGNING_SECRET_VAR>()` etc).
 * Nothing in the client graph
 * imports it; if a future better-auth upgrade adds such an import, this stub
 * fails the build loudly instead of silently re-introducing the leak.
 */
