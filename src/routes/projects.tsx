import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { getServerSession, type SessionUser } from "../lib/session-fn";
import type { PublicProject } from "../lib/types";

/**
 * Gated projects page.
 *
 * ACCESS CONTROL IS NOT HERE. src/server.ts already refused to render this route
 * at all for anyone without a valid, unbanned session — it returns a 302 to
 * /login before React ever runs. The `beforeLoad` check below is a second belt,
 * not the braces.
 *
 * ── WHY DATA IS FETCHED IN useEffect AND NOT IN `loader` ────────────────────
 * A route `loader` runs on the SERVER during SSR. If it fetched "/api/projects",
 * the Worker would be making an HTTP request to itself — and a Worker waiting on
 * a subrequest to itself deadlocks the isolate. Start's own request context
 * (getRequestHeaders) is fine in a loader because it reads memory, not network;
 * a self-fetch is not. So: the loader pulls the session from the internal header
 * (no I/O), and the project list is fetched client-side after hydration, where
 * "/api/projects" is a normal same-origin browser request.
 *
 * ── RETRY (R4) ──────────────────────────────────────────────────────────────
 * The fetch depends on a `reloadKey` counter, so the "Try again" button on the
 * error state re-runs it (resetting state first so the skeleton comes back)
 * instead of asking the user to refresh the whole page.
 */
export const Route = createFileRoute("/projects")({
	head: () => ({
		meta: [{ title: "Projects — you.ge" }],
	}),
	loader: async () => ({
		session: await getServerSession(),
	}),
	component: Projects,
});

type ProjectsResponse = {
	projects?: PublicProject[];
	error?: string;
};

function Projects() {
	const { session } = Route.useLoaderData() as { session: SessionUser | null };
	const [projects, setProjects] = useState<PublicProject[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let cancelled = false;

		// Drop any stale error/list from a previous attempt so the skeleton
		// (not the old error) shows while this one is in flight.
		setProjects(null);
		setError(null);

		void (async () => {
			try {
				const res = await fetch("/api/projects", {
					// Same-origin cookies carry the better-auth session.
					credentials: "same-origin",
					headers: { Accept: "application/json" },
				});
				const data = (await res.json()) as ProjectsResponse;

				if (cancelled) return;
				if (!res.ok) {
					setError(data.error ?? `Request failed (${res.status})`);
					return;
				}
				setProjects(data.projects ?? []);
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Could not load projects");
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [reloadKey]);

	const reload = useCallback(() => setReloadKey((k) => k + 1), []);

	return (
		<div style={{ paddingTop: "2rem" }}>
			<div className="spread" style={{ marginBottom: "1.75rem" }}>
				<div>
					<h1>Projects</h1>
					<p className="muted" style={{ margin: 0 }}>
						Synced from GitHub every 6 hours.
						{session ? ` Signed in as ${session.email}.` : ""}
					</p>
				</div>
				{/* role=status announces "loading" → "N visible" politely. */}
				<span className="badge" role="status" aria-live="polite">
					{projects === null ? "loading" : `${projects.length} visible`}
				</span>
			</div>

			{error ? (
				<div className="notice notice-danger" role="alert">
					<strong>Could not load projects.</strong>
					<p className="muted" style={{ margin: "0.4rem 0 0" }}>
						{error}
					</p>
					<div className="row" style={{ gap: "0.75rem", marginTop: "0.9rem" }}>
						<button type="button" className="btn btn-sm" onClick={reload}>
							↻ Try again
						</button>
						<Link to="/" className="btn btn-sm">
							Back to home
						</Link>
					</div>
					<p className="dim" style={{ margin: "0.8rem 0 0" }}>
						If this persists, the GitHub sync may not have run yet. An admin can
						trigger it from <Link to="/admin/repos">the admin panel</Link>.
					</p>
				</div>
			) : null}

			{projects === null && !error ? <ProjectSkeleton /> : null}

			{projects !== null && projects.length === 0 && !error ? (
				<div className="notice notice-warning">
					<strong>No projects yet.</strong>
					<p className="muted" style={{ margin: "0.4rem 0 0" }}>
						The repositories table is empty. Either the cron sync has not run,
						or every repo is currently hidden by an administrator.
					</p>
				</div>
			) : null}

			{projects !== null && projects.length > 0 ? (
				<div className="grid">
					{projects.map((project) => (
						<ProjectCard key={project.id} project={project} />
					))}
				</div>
			) : null}
		</div>
	);
}

function ProjectCard({ project }: { project: PublicProject }) {
	return (
		<a
			className="card card-hover project-card"
			href={project.url}
			target="_blank"
			rel="noreferrer noopener"
		>
			<div className="spread">
				<h3 className="project-name">
					{project.name}
					{/* External-link affordance: the whole card is the link, so the
					    arrow says "this opens on github.com". */}
					<span className="ext-arrow" aria-hidden="true">
						↗
					</span>
				</h3>
				{project.featured ? <span className="badge badge-accent">Featured</span> : null}
			</div>

			<p className="project-desc">
				{project.description ?? <span className="dim">No description.</span>}
			</p>

			<div className="row">
				{project.language ? <span className="badge">{project.language}</span> : null}
				<span className="badge">★ {formatCount(project.stars)}</span>
				<span className="badge">⑂ {formatCount(project.forks)}</span>
			</div>

			{project.topics.length > 0 ? (
				<div className="row">
					{project.topics.slice(0, 4).map((topic) => (
						<span key={topic} className="dim" style={{ fontSize: "0.75rem" }}>
							#{topic}
						</span>
					))}
				</div>
			) : null}

			<div className="card-meta">
				<span>{project.pushedAt ? `Updated ${relativeTime(project.pushedAt)}` : ""}</span>
				<span className="ext-hint">View on GitHub</span>
			</div>
		</a>
	);
}

function ProjectSkeleton() {
	return (
		<div className="grid" aria-hidden="true">
			{[0, 1, 2].map((i) => (
				<div key={i} className="card">
					<div className="skeleton" style={{ height: "1.1rem", width: "55%" }} />
					<div className="skeleton" style={{ height: "0.85rem", width: "100%", marginTop: "0.9rem" }} />
					<div className="skeleton" style={{ height: "0.85rem", width: "78%", marginTop: "0.5rem" }} />
					<div className="row" style={{ marginTop: "1rem" }}>
						<div className="skeleton" style={{ height: "1.3rem", width: "4.5rem", borderRadius: "999px" }} />
						<div className="skeleton" style={{ height: "1.3rem", width: "3.5rem", borderRadius: "999px" }} />
					</div>
				</div>
			))}
		</div>
	);
}

function formatCount(n: number): string {
	if (n < 1000) return String(n);
	return `${(n / 1000).toFixed(1)}k`;
}

/**
 * Coarse relative time for "Updated …" (client-side render only — the card grid
 * is produced after hydration, so there is no SSR/hydration time mismatch to
 * worry about). Unparseable input renders as empty, never "NaN".
 */
function relativeTime(iso: string): string {
	const ms = Date.now() - Date.parse(iso);
	if (!Number.isFinite(ms) || ms < 0) return "";

	const minutes = ms / 60_000;
	if (minutes < 1) return "just now";
	if (minutes < 60) return plural(Math.round(minutes), "minute");
	const hours = minutes / 60;
	if (hours < 24) return plural(Math.round(hours), "hour");
	const days = hours / 24;
	if (days < 8) return plural(Math.round(days), "day");
	const weeks = days / 7;
	if (weeks < 5) return plural(Math.round(weeks), "week");
	const months = days / 30.44;
	if (months < 12) return plural(Math.round(months), "month");
	return plural(Math.round(days / 365.25), "year");
}

function plural(n: number, unit: string): string {
	return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
