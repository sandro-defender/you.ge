import { ADMIN_ROLES, hasRole } from "./roles.ts";

export function audiencesForUser(userId: string, role: string | null | undefined): string[] {
	const base = [`user:${userId}`];
	if (hasRole(role, ADMIN_ROLES)) base.unshift("admin");
	return base;
}
