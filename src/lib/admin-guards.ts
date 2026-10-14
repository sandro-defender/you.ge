import { ADMIN_ROLES, hasRole } from "./roles.ts";

/**
 * Pure decision for a change to a user's role and/or ban state.
 *
 * Shared by BOTH write paths so they cannot drift apart:
 *   - PATCH /api/admin/users/:id (src/server/admin-router.ts), and
 *   - better-auth's /api/auth/admin/* endpoints, via the last-admin
 *     `databaseHooks.user.update.before` hook in src/lib/auth.ts.
 *
 * Role strings can be comma-separated ("admin,member" — better-auth joins
 * role arrays with ","), so every admin check goes through hasRole(), never
 * `=== "admin"`.
 */
export function canChangeAdminState(options: {
	currentRole: string | null | undefined;
	currentBanned: boolean;
	nextRole: string | null | undefined;
	nextBanned: boolean;
	remainingOtherAdmins: number;
	/** True when the acting administrator is changing their own account. */
	actingOnSelf?: boolean;
}) {
	const suspending = !options.currentBanned && options.nextBanned;
	// Mirrors better-auth's own banUser ("You cannot ban yourself").
	if (options.actingOnSelf && suspending) {
		return { ok: false as const, reason: "You cannot suspend your own account." };
	}
	if (!hasRole(options.currentRole, ADMIN_ROLES)) return { ok: true as const };
	const removingAdminRole =
		options.nextRole !== undefined && !hasRole(options.nextRole, ADMIN_ROLES);
	if ((removingAdminRole || suspending) && options.remainingOtherAdmins < 1) {
		return {
			ok: false as const,
			reason: removingAdminRole
				? "Cannot remove the final administrator."
				: "Cannot suspend the final administrator.",
		};
	}
	return { ok: true as const };
}

/**
 * Administrators other than `excludingId` who can still sign in — banned
 * admins cannot create a session, so they do not count as a fallback.
 */
export function countOtherActiveAdmins(
	rows: ReadonlyArray<{ id: string; role: string | null; banned: boolean | null }>,
	excludingId: string,
): number {
	return rows.filter(
		(row) => row.id !== excludingId && !row.banned && hasRole(row.role, ADMIN_ROLES),
	).length;
}
