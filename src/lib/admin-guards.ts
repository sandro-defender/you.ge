export function canChangeAdminState(options: {
	currentRole: string | null | undefined;
	currentBanned: boolean;
	nextRole: string | null | undefined;
	nextBanned: boolean;
	remainingOtherAdmins: number;
}) {
	const isAdmin = options.currentRole === "admin";
	if (!isAdmin) return { ok: true as const };
	const removingAdminRole = options.nextRole !== undefined && options.nextRole !== "admin";
	const suspendingAdmin = !options.currentBanned && options.nextBanned;
	if ((removingAdminRole || suspendingAdmin) && options.remainingOtherAdmins === 0) {
		return {
			ok: false as const,
			reason: removingAdminRole
				? "Cannot remove the final administrator."
				: "Cannot suspend the final administrator.",
		};
	}
	return { ok: true as const };
}
