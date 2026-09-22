/**
 * Bindings + secrets available to the Worker.
 *
 * ── WHY THIS EXTENDS `Cloudflare.Env` INSTEAD OF RESTATING IT ───────────────
 * `wrangler types` generates `Cloudflare.Env` from wrangler.jsonc into
 * worker-configuration.d.ts, and with `--strict-vars` (the default) it types
 * `vars` as STRING LITERALS — e.g. `GITHUB_USERNAME: "sandro-defender"`, not
 * `string`.
 *
 * An earlier version of this file declared its own structural `Env`, and the two
 * were mutually unassignable in both directions: `string | undefined` is not
 * assignable to the literal `"sandro-defender"`, and the literal type is not
 * assignable to `string | undefined`. That produced TS2345 at every boundary.
 * Intersecting with the generated type makes wrangler.jsonc the single source of
 * truth for bindings and vars, and this file only adds what wrangler cannot know
 * about: secrets.
 */

/**
 * Secrets, set via `wrangler secret put <NAME>` in production and read from
 * `.dev.vars` locally. wrangler does NOT generate types for secrets — that is
 * deliberate, so their names never leak into a committed file.
 */
export type Secrets = {
	/** Signs better-auth session cookies. 32+ chars. */
	BETTER_AUTH_SECRET: string;
	/** Public origin of this deployment, e.g. https://you.ge */
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	/**
	 * GitHub PAT read by the cron trigger only. Optional — the sync degrades
	 * gracefully and the site keeps serving whatever is already in D1.
	 */
	GITHUB_TOKEN?: string;
};

/** Everything the Worker can read off `env`. */
export type Env = Cloudflare.Env & Secrets;

/**
 * better-auth is constructed per request, because the D1 binding only exists
 * on `env`, which arrives with the request. This type is what `createAuth(env)`
 * returns — inferred from the config so plugin endpoints (admin.setRole, etc.)
 * stay fully typed without a manual declaration.
 */
export type AuthInstance = ReturnType<typeof import("./auth.js").createAuth>;
