import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
// Imported from a dependency-free leaf module, NEVER from ../server — see the
// note in internal-header.ts about keeping server code out of the browser bundle.
import { INTERNAL_SESSION_HEADER } from "./internal-header";

/**
 * The session, as far as React components are concerned.
 *
 * Deliberately a narrow projection — id, name, email, image, role — because
 * that is all the UI needs and nothing here can leak a token or a ban reason.
 */
export type SessionUser = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string | null;
};

/**
 * Read the session that src/server.ts already validated for this request.
 *
 * WHY THIS DOES NOT TOUCH D1
 * The Worker entry point validated the session (from better-auth's signed
 * cookie cache, usually at zero D1 cost) and forwarded the result on an
 * internal header. This function just reads that header, so rendering a page
 * never triggers a second session lookup.
 *
 * WHY IT IS SAFE
 * `src/server.ts` strips this header from every inbound request before doing
 * anything else, then sets it only on requests it has validated. A client
 * cannot forge it.
 *
 * Returns null on public routes, where the entry point does not validate a
 * session at all (so the header is absent even for a signed-in visitor).
 * Components that need the session on a public route should use the
 * `useAuthSession()` hook from src/lib/auth-client.ts instead, which calls
 * /api/auth/get-session. (Do NOT reach for `authClient.useSession` — in
 * better-auth 1.7.5 that is a nanostores Atom, not a React hook.)
 */
export const getServerSession = createServerFn({ method: "GET" }).handler(
	async (): Promise<SessionUser | null> => {
		const raw = getRequestHeaders().get(INTERNAL_SESSION_HEADER);
		if (!raw) return null;

		try {
			const parsed = JSON.parse(raw) as Partial<SessionUser>;
			if (typeof parsed.id !== "string" || typeof parsed.email !== "string") {
				return null;
			}
			return {
				id: parsed.id,
				name: parsed.name ?? "",
				email: parsed.email,
				image: parsed.image ?? null,
				role: parsed.role ?? null,
			};
		} catch {
			return null;
		}
	},
);
