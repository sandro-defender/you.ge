import assert from "node:assert/strict";
import { toPublicTeaser } from "../src/lib/public-teaser.ts";

// /api/public/home is UNAUTHENTICATED. The case-study narrative is member-only
// (served by /api/projects/:owner/:name behind requireMember), so the public
// homepage payload must never carry it — the cards do not render it anyway.
const project = {
	id: 1,
	owner: "sandro-defender",
	name: "alpha",
	slug: "sandro-defender/alpha",
	title: "Alpha Studio",
	description: "Cloudflare dashboard",
	githubDescription: "Cloudflare dashboard",
	url: "https://github.com/sandro-defender/alpha",
	homepage: "https://alpha.example.com",
	language: "TypeScript",
	stars: 42,
	forks: 3,
	openIssues: 1,
	topics: ["cloudflare"],
	tags: ["TypeScript", "cloudflare"],
	featured: true,
	showOnHomepage: true,
	image: null,
	imageAlt: "Alpha Studio project preview",
	category: "Studio",
	health: "launch-ready",
	healthLabel: "Launch-ready",
	score: 80,
	pushedAt: "2026-10-01T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	lastSyncedAt: "2026-10-01T00:00:00.000Z",
	challenge: "member-only challenge",
	solution: "member-only solution",
	caseStudy: "member-only case study",
};

const teaser = toPublicTeaser(project);

assert.equal(teaser.challenge, null, "challenge must not reach anonymous visitors");
assert.equal(teaser.solution, null, "solution must not reach anonymous visitors");
assert.equal(teaser.caseStudy, null, "caseStudy must not reach anonymous visitors");
assert.deepEqual(
	{ ...teaser, challenge: project.challenge, solution: project.solution, caseStudy: project.caseStudy },
	project,
	"every card field the homepage renders is preserved",
);
assert.equal(project.caseStudy, "member-only case study", "the input object is not mutated");

console.log("public home payload tests passed");
