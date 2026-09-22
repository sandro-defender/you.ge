/**
 * The site's access-control roles — shared by the SERVER auth config
 * (src/lib/auth.ts → admin({ roles })) and the BROWSER auth client
 * (src/lib/auth-client.ts → adminClient({ roles })).
 *
 * WHY BOTH SIDES NEED THE SAME MAP (verified against better-auth 1.7.5):
 *
 * Server (`admin({ roles })`):
 *   - setRole VALIDATES the submitted role against this map — an unknown
 *     string (typo, stale UI) is rejected with BAD_REQUEST instead of being
 *     written into `user.role`.
 *   - hasPermission() resolves role → permissions from this map, so `member`
 *     deliberately carries `user: []` (no admin powers): a member cannot call
 *     any /api/auth/admin/* endpoint.
 *
 * Client (`adminClient({ roles })`):
 *   - WIDENS THE TYPES. Without it, `authClient.admin.setRole` is typed
 *     `"user" | "admin"` (InferAdminRolesFromOption falls back to the default
 *     pair) and granting `member` fails typecheck — TS2322 — even though the
 *     HTTP endpoint would accept any string when no roles option is set.
 *
 * Modules imported here are pure access-control code (statements + Role
 * objects): `better-auth/plugins/admin/access` and `better-auth/plugins/access`
 * contain no env, no db, no secrets — safe on both sides, and verified to
 * keep the §5 client-bundle leak check clean. This is NOT the same as
 * importing src/lib/auth.ts (the server factory), which must never reach the
 * browser.
 */
import { defaultAc, adminAc, userAc } from "better-auth/plugins/admin/access";

/**
 * `member` = exactly the permissions of a plain `user` (none of the admin
 * set). The grant that matters is the ROLE STRING itself: ACCESS_POLICY in
 * src/server.ts and requireMember in src/server/guard.ts open /projects when
 * role ∈ {admin, member}. Built from `defaultAc` — the same AccessControl
 * instance as adminAc/userAc — so authorize() checks against the same
 * statement keys the admin plugin's endpoints request
 * (e.g. `{ user: ["set-role"] }`).
 */
const memberAc = defaultAc.newRole({
	user: [],
	session: [],
});

/** Role map passed to both `admin({ roles })` and `adminClient({ roles })`. */
export const siteRoles = {
	admin: adminAc,
	member: memberAc,
	user: userAc,
};
