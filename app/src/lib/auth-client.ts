import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

/**
 * Browser-side auth client.
 *
 * No baseURL is passed, so it uses the current origin — correct for both local
 * dev and production without any environment branching.
 *
 * `adminClient()` adds the typed admin methods (listUsers, setRole, banUser,
 * revokeUserSessions, …) for the endpoints the admin plugin exposes under
 * /api/auth/admin/*. Without it the client does not know those endpoints exist.
 *
 * ── DO NOT IMPORT THE SERVER AUTH MODULE HERE ───────────────────────────────
 * An earlier version of this file inferred the session type with
 * `typeof import("./auth")`. Even as `import type`, that pulled better-auth's
 * server-side `env` accessor module into the CLIENT bundle — verified by
 * grepping dist/client, where `get BETTER_AUTH_SECRET(){...}` turned up.
 *
 * No secret value leaked (that code only reads a runtime env that does not exist
 * in a browser), but shipping server config plumbing to the browser is exactly
 * the habit that eventually does leak something. Keep this module importing only
 * from "better-auth/client".
 */
export const authClient = createAuthClient({
	plugins: [adminClient()],
});

// NOTE: `useSession` is deliberately NOT re-exported. In 1.7.5 it is an Atom,
// not a hook — see useAuthSession() at the bottom of this file.
export const { signIn, signOut } = authClient;

/**
 * The slice of a better-auth session this UI relies on.
 *
 * Written out explicitly rather than inferred from the server config, for the
 * reason above. The fields mirror what the admin plugin adds to `user`
 * (role/banned/banReason) — if you enable more plugins, extend this by hand.
 */
export type SessionUser = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
};

export type Session = {
	user: SessionUser;
	session: {
		id: string;
		expiresAt: string | Date;
		token: string;
		createdAt: string | Date;
		updatedAt: string | Date;
		ipAddress?: string | null;
		userAgent?: string | null;
		userId: string;
		impersonatedBy?: string | null;
	};
} | null;

/* ══════════════════════════════════════════════════════════════════════════
   React session hook
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";

/**
 * ⚠️ `authClient.useSession` is NOT a React hook in better-auth 1.7.5.
 *
 * It is a nanostores Atom (its keys are eq/get/init/lc/listen/notify/off/set/
 * subscribe/value/events). Calling it — `useSession()` — fails typecheck with
 * TS2349 "This expression is not callable", and would throw at runtime too.
 * Older tutorials and the 1.4-era docs show it being called as a hook; that API
 * no longer works this way. Verified by probing the installed package.
 *
 * So: use this hook. It calls the plain `getSession()` function, which hits
 * /api/auth/get-session. better-auth answers that from its signed cookie cache
 * for up to 5 minutes (session.cookieCache in src/lib/auth.ts), so in the common
 * case it costs ZERO D1 rows — which matters, because D1 Free hard-fails every
 * query past 5M rows read/day.
 */
export function useAuthSession() {
	const [session, setSession] = useState<Session | null>(null);
	const [isPending, setIsPending] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setIsPending(true);
		const { data, error: sessionError } = await authClient.getSession();
		if (sessionError) {
			setError(sessionError.message ?? "Could not load session");
			setSession(null);
		} else {
			setError(null);
			setSession((data as Session | null) ?? null);
		}
		setIsPending(false);
	}, []);

	useEffect(() => {
		let ignore = false;

		void (async () => {
			const { data, error: sessionError } = await authClient.getSession();
			if (ignore) return;
			if (sessionError) {
				setError(sessionError.message ?? "Could not load session");
			} else {
				setSession((data as Session | null) ?? null);
			}
			setIsPending(false);
		})();

		return () => {
			ignore = true;
		};
	}, []);

	/** Sign out, then refresh so the UI updates without a full page reload. */
	const signOutAndRefresh = useCallback(async () => {
		await signOut();
		setSession(null);
		await refresh();
	}, [refresh]);

	return { session, user: session?.user ?? null, isPending, error, refresh, signOutAndRefresh };
}
