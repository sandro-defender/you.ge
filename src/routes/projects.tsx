import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ProjectCard } from "../components/ProjectCard";
import { getServerSession, type SessionUser } from "../lib/session-fn";
import {
	DEFAULT_PROJECT_FILTERS,
	collectFacets,
	filterProjects,
} from "../lib/repo-ranking";
import { safeLoader } from "../lib/safe-loader";
import type { ProjectFilterState, PublicProject } from "../lib/types";
import { useApi } from "../lib/use-api";

export const Route = createFileRoute("/projects")({
	head: () => ({ meta: [{ title: "Projects — you.ge" }] }),
	loader: safeLoader(async () => ({ session: await getServerSession() })),
	component: Projects,
});

function Projects() {
	const { session } = Route.useLoaderData() as { session: SessionUser | null };
	const { data, error, loading, refetch } = useApi<{ projects: PublicProject[] }>("/api/projects");
	const [filters, setFilters] = useState<ProjectFilterState>(DEFAULT_PROJECT_FILTERS);
	const projects = data?.projects ?? [];
	const facets = useMemo(() => collectFacets(projects), [projects]);
	const visible = useMemo(() => filterProjects(projects, filters), [projects, filters]);

	return (
		<div className="page-stack">
			<section className="page-header">
				<div>
					<p className="eyebrow">Project library</p>
					<h1>Discover the strongest repositories first</h1>
					<p className="muted page-subtitle">
						Sorted automatically by activity, quality signals, and editorial
						priority. Signed in as {session?.email ?? "member"}.
					</p>
				</div>
				<div className="stat-strip">
					<MiniStat label="Visible" value={String(projects.length)} />
					<MiniStat label="Featured" value={String(projects.filter((project) => project.featured).length)} />
					<MiniStat label="Languages" value={String(facets.languages.length)} />
				</div>
			</section>

			<section className="glass-panel filter-panel">
				<div className="filter-grid">
					<label className="field-label">
						<span>Search</span>
						<input
							className="input"
							type="search"
							placeholder="Search projects, tags, or categories…"
							value={filters.search}
							onChange={(event) =>
								setFilters((current) => ({ ...current, search: event.target.value }))
							}
						/>
					</label>

					<label className="field-label">
						<span>Language</span>
						<select
							className="select"
							value={filters.language}
							onChange={(event) =>
								setFilters((current) => ({ ...current, language: event.target.value }))
							}
						>
							<option value="all">All languages</option>
							{facets.languages.map((language) => (
								<option key={language} value={language}>
									{language}
								</option>
							))}
						</select>
					</label>

					<label className="field-label">
						<span>Topic</span>
						<select
							className="select"
							value={filters.topic}
							onChange={(event) =>
								setFilters((current) => ({ ...current, topic: event.target.value }))
							}
						>
							<option value="all">All topics</option>
							{facets.topics.map((topic) => (
								<option key={topic} value={topic}>
									{topic}
								</option>
							))}
						</select>
					</label>

					<label className="field-label">
						<span>Featured</span>
						<select
							className="select"
							value={filters.featured}
							onChange={(event) =>
								setFilters((current) => ({
									...current,
									featured: event.target.value === "featured" ? "featured" : "all",
								}))
							}
						>
							<option value="all">All projects</option>
							<option value="featured">Featured only</option>
						</select>
					</label>

					<label className="field-label">
						<span>Sort</span>
						<select
							className="select"
							value={filters.sort}
							onChange={(event) =>
								setFilters((current) => ({
									...current,
									sort: event.target.value as ProjectFilterState["sort"],
								}))
							}
						>
							<option value="featured">Featured first</option>
							<option value="activity">Newest activity</option>
							<option value="stars">Most stars</option>
							<option value="name">Alphabetical</option>
						</select>
					</label>
				</div>
				<div className="spread" style={{ marginTop: "1rem" }}>
					<p className="muted" style={{ margin: 0 }}>
						Showing {visible.length} of {projects.length} repositories.
					</p>
					<button type="button" className="btn btn-sm" onClick={refetch} disabled={loading}>
						{loading ? <span className="spinner" /> : "Refresh"}
					</button>
				</div>
			</section>

			{error ? (
				<div className="glass-panel notice notice-danger" role="alert">
					<strong>Could not load projects.</strong>
					<p className="muted">{error}</p>
					<div className="row">
						<button type="button" className="btn btn-sm" onClick={refetch}>
							Try again
						</button>
						<Link to="/" className="btn btn-sm">
							Back home
						</Link>
					</div>
				</div>
			) : null}

			{loading ? (
				<div className="project-grid">
					{Array.from({ length: 6 }, (_, index) => (
						<div key={index} className="glass-panel">
							<div className="skeleton project-skeleton-media" />
							<div className="skeleton" style={{ height: "1.35rem", marginTop: "1rem", width: "65%" }} />
							<div className="skeleton" style={{ height: "1rem", marginTop: "0.8rem" }} />
							<div className="skeleton" style={{ height: "1rem", marginTop: "0.55rem", width: "86%" }} />
						</div>
					))}
				</div>
			) : null}

			{!loading && !error && visible.length === 0 ? (
				<div className="glass-panel empty-state">
					<strong>No projects match those filters.</strong>
					<p className="muted">
						Try broadening the search, switching languages, or removing the
						featured-only filter.
					</p>
					<button type="button" className="btn btn-sm" onClick={() => setFilters(DEFAULT_PROJECT_FILTERS)}>
						Reset filters
					</button>
				</div>
			) : null}

			{!loading && visible.length > 0 ? (
				<div className="project-grid">
					{visible.map((project) => (
						<ProjectCard key={project.id} project={project} compact />
					))}
				</div>
			) : null}
		</div>
	);
}

function MiniStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="stat-card stat-card-compact">
			<strong>{value}</strong>
			<span>{label}</span>
		</div>
	);
}
