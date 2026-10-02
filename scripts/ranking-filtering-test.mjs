import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT_FILTERS,
  filterProjects,
  resolveFeaturedProjectIds,
  scoreRepository,
} from "../src/lib/repo-ranking.ts";

const active = scoreRepository({
  description: "A richly documented Cloudflare-native product studio portfolio.",
  homepage: "https://you.ge",
  language: "TypeScript",
  stars: 42,
  topics: ["cloudflare", "react", "portfolio"],
  githubPushedAt: new Date(),
  manualPriority: 2,
});
const stale = scoreRepository({
  description: null,
  homepage: null,
  language: null,
  stars: 0,
  topics: [],
  githubPushedAt: new Date("2021-01-01T00:00:00.000Z"),
  manualPriority: 0,
});
assert.ok(active.total > stale.total, "active repos should outrank stale ones");

const repos = [
  {
    id: 1,
    hidden: false,
    featuredOverride: null,
    score: active.total,
    sortOrder: 0,
    stars: 42,
    githubPushedAt: new Date(),
  },
  {
    id: 2,
    hidden: false,
    featuredOverride: false,
    score: active.total + 5,
    sortOrder: 0,
    stars: 100,
    githubPushedAt: new Date(),
  },
  {
    id: 3,
    hidden: false,
    featuredOverride: true,
    score: stale.total,
    sortOrder: 0,
    stars: 0,
    githubPushedAt: new Date("2021-01-01T00:00:00.000Z"),
  },
];
const featured = resolveFeaturedProjectIds(repos);
assert.equal(featured.has(1), true, "strong repos should auto-feature");
assert.equal(featured.has(2), false, "manual off must beat auto-feature");
assert.equal(featured.has(3), true, "manual on must force featured");

const projects = [
  {
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
    tags: ["TypeScript", "cloudflare", "react"],
    featured: true,
    showOnHomepage: true,
    image: null,
    imageAlt: null,
    category: "Studio",
    health: "launch-ready",
    healthLabel: "Launch-ready",
    score: active.total,
    pushedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    challenge: null,
    solution: null,
    caseStudy: null,
  },
  {
    id: 2,
    owner: "sandro-defender",
    name: "beta",
    slug: "sandro-defender/beta",
    title: "Beta API",
    description: "Rust service",
    githubDescription: "Rust service",
    url: "https://github.com/sandro-defender/beta",
    homepage: null,
    language: "Rust",
    stars: 8,
    forks: 1,
    openIssues: 0,
    topics: ["api"],
    tags: ["Rust", "api"],
    featured: false,
    showOnHomepage: false,
    image: null,
    imageAlt: null,
    category: "Backend",
    health: "active",
    healthLabel: "Actively evolving",
    score: 49,
    pushedAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
    createdAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    challenge: null,
    solution: null,
    caseStudy: null,
  },
];

const featuredOnly = filterProjects(projects, { ...DEFAULT_PROJECT_FILTERS, featured: "featured" });
assert.deepEqual(featuredOnly.map((project) => project.id), [1], "featured filter should only keep featured repos");

const searchHit = filterProjects(projects, { ...DEFAULT_PROJECT_FILTERS, search: "rust" });
assert.deepEqual(searchHit.map((project) => project.id), [2], "search should match language and tags");

const languageHit = filterProjects(projects, { ...DEFAULT_PROJECT_FILTERS, language: "TypeScript" });
assert.deepEqual(languageHit.map((project) => project.id), [1], "language filter should narrow the grid");

console.log("ranking and filtering tests passed");
