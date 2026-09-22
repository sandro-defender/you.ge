import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createDb } from "./db";
import type { Env } from "./env";

/**
 * better-auth factory.
 *
 * WHY A FACTORY AND NOT A MODULE-LEVEL `export const auth = betterAuth({...})`
 * Every better-auth example you find does the latter. It cannot work here: the
 * D1 binding lives on `env`, and `env` only exists once a request arrives. A
 * module-level instance would have to be built before any binding exists.
 *
 * So: one instance per request, created from that request's `env`. This is
 * cheap (a synchronous config object) and it is the pattern Cloudflare's own
 * runtime forces on you.
 *
 * ── Workers Free decisions baked in below ───────────────────────────────────
 * 1. Sessions live in D1 ONLY. No `secondaryStorage` (KV): better-auth checks
 *    secondary storage BEFORE the database and short-circuits on a hit, so a
 *    KV-backed session gets served from a stale colo after you revoke it.
 * 2. No Durable Objects for live session sync — those require Workers Paid.
 * 3. `cookieCache` is ON, which cuts D1 reads roughly 10x. Trade-off: revoking
 *    a session takes up to 5 minutes to reach an already-open tab. For a
 *    portfolio that is the right trade; lower `maxAge` if you disagree.
 */
export function createAuth(env: Env) {
	const baseUrl =
		env.BETTER_AUTH_URL ?? env.APP_URL ?? "http://localhost:3000";

	const isDev = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");

	return betterAuth({
		// D1 has no direct better-auth adapter. Drizzle (or Kysely) is required —
		// searching for a `d1Adapter()` wastes hours, it does not exist.
		database: drizzleAdapter(createDb(env.DB), {
			provider: "sqlite",
		}),

		appName: "you.ge",
		baseURL: baseUrl,
		secret: env.BETTER_AUTH_SECRET,

		// CSRF allowlist. Derived from the deployment origin rather than "*" —
		// a wildcard origin list defeats the point of the check.
		trustedOrigins: isDev
			? ["http://localhost:3000", "http://127.0.0.1:3000"]
			: [baseUrl],

		// ── Google OAuth ────────────────────────────────────────────────────
		// The redirect URI registered in Google Cloud Console MUST be
		//   {baseUrl}/api/auth/callback/google
		// A mismatch fails every single sign-in, and the fix lives in a console
		// this repo cannot see — so it is the first thing to check.
		//
		// `enabled` is derived so that a missing credential degrades to "Google
		// sign-in hidden" instead of a 500 on the callback.
		socialProviders: {
			google: {
				enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
				clientId: env.GOOGLE_CLIENT_ID ?? "",
				clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
			},
		},

		// Google-only sign-in: nobody can self-register with a password. Access
		// is granted by an admin in the panel, which is the whole point of the
		// gating requirement. Flip `enabled` to true if you also want
		// email+password fallback logins.
		emailAndPassword: {
			enabled: false,
		},

		session: {
			// 7 days, matching the cookie lifetime.
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60, // 5 minutes — see note 3 above
			},
		},

		plugins: [
			/**
			 * The admin plugin is what makes "admin panel where I can grant
			 * access to users" mostly free. It adds:
			 *   /admin/list-users, /admin/set-role, /admin/ban-user,
			 *   /admin/unban-user, /admin/revoke-user-sessions,
			 *   /admin/remove-user, /admin/impersonate-user, ...
			 *
			 * GOTCHA: it has TWO authorization layers. Your own middleware check
			 * AND better-auth's internal `user.role === "admin"` in the database
			 * must BOTH pass, or admin endpoints return 403 with no obvious
			 * reason. Bootstrap the first admin with `npm run auth:create-admin`
			 * rather than hand-editing rows.
			 */
			admin({
				defaultRole: "user",
				adminRoles: ["admin"],
				defaultBanReason: "Access revoked by an administrator.",
				bannedUserMessage:
					"Your access to this site has been suspended. Contact the site owner.",
				// Impersonating an admin is disabled by default since v1.4.6.
				// Left off deliberately: on a single-admin portfolio there is no
				// support workflow that needs it, and it is a privilege-escalation
				// surface for no benefit.
				allowImpersonatingAdmins: false,
			}),
		],

		advanced: {
			// Ip from Cloudflare's headers, not the direct peer (which is always
			// a Cloudflare edge).
			ipAddress: {
				ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
			},
			defaultCookieAttributes: {
				httpOnly: true,
				secure: !isDev,
				// Lax (not None): blocks the cookie on cross-site POST, which is
				// the CSRF vector that matters here. None would be required only
				// if the frontend lived on a different origin than the API.
				sameSite: "lax",
			},
		},
	});
}

/** Roles this app understands. Extend here and in the DB check constraint. */
export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];
