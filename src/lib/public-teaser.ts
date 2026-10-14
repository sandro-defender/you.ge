import type { PublicProject } from "./types";

/**
 * Homepage-safe view of a project.
 *
 * `/api/public/home` is UNAUTHENTICATED, while the case-study narrative
 * (challenge / solution / caseStudy) is member-only content served by
 * `/api/projects/:owner/:name` behind requireMember. The homepage cards never
 * render those fields, so the public payload blanks them rather than shipping
 * gated copy to anonymous visitors.
 *
 * A dependency-free leaf (type-only import) so scripts/public-home-test.mjs
 * can unit-test it with Node's type stripping.
 */
export function toPublicTeaser(project: PublicProject): PublicProject {
	return { ...project, challenge: null, solution: null, caseStudy: null };
}
