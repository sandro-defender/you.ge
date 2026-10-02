import { Link, createFileRoute } from "@tanstack/react-router";
import { ProjectCard } from "../components/ProjectCard";
import { useAuthSession } from "../lib/auth-client";
import { trackEvent } from "../lib/analytics";
import { useApi } from "../lib/use-api";
import type { HomeData } from "../lib/types";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "you.ge — premium developer portfolio" },
			{ name: "robots", content: "index, follow" },
			{
				property: "og:title",
				content: "you.ge — premium developer portfolio",
			},
			{
				property: "og:description",
				content:
					"Product-minded engineering, curated GitHub work, and a private client showcase built for thoughtful teams.",
			},
			{ property: "og:url", content: "https://you.ge/" },
		],
		links: [{ rel: "canonical", href: "https://you.ge/" }],
	}),
	component: Home,
});

function Home() {
	const { user } = useAuthSession();
	const signedIn = Boolean(user);
	const { data, error, loading } = useApi<HomeData>("/api/public/home");
	const projects = data?.featuredProjects ?? [];

	return (
		<div className="page-stack home-page">
			<section className="hero-section">
				<div className="hero-copy">
					<div className="row row-tight">
						<span className="badge badge-accent">Available for selective collaborations</span>
						<span className="status-pill">
							<span className="status-dot" /> Shipping product, platform, and frontend systems
						</span>
					</div>

					<h1>
						Developer craftsmanship for products that need <span>taste, speed, and rigor.</span>
					</h1>
					<p className="hero-lead">
						I'm Sandro — I design and build polished web products, internal tools,
						and portfolio-grade frontends with a strong bias for performance,
						maintainability, and launch readiness.
					</p>

					<div className="hero-actions row">
						{signedIn ? (
							<Link
								to="/projects"
								className="btn btn-primary"
								onClick={() => trackEvent("home.projects")}
							>
								Browse projects
							</Link>
						) : (
							<Link
								to="/login"
								className="btn btn-primary"
								onClick={() => trackEvent("home.signin")}
							>
								Sign in with Google
							</Link>
						)}
						<Link to="/projects" className="btn" onClick={() => trackEvent("home.selected-work") }>
							View selected work
						</Link>
						<a
							className="btn"
							href="https://github.com/sandro-defender"
							target="_blank"
							rel="noreferrer noopener"
							onClick={() => trackEvent("home.github")}
						>
							GitHub ↗
						</a>
					</div>

					<div className="hero-skill-grid">
						{[
							"TypeScript & React systems",
							"Cloudflare-native delivery",
							"Design-aware frontend architecture",
							"Admin tools and internal products",
						].map((item) => (
							<div key={item} className="glass-chip">
								{item}
							</div>
						))}
					</div>
				</div>

				<div className="hero-panel glass-panel">
					<p className="eyebrow">GitHub activity snapshot</p>
					<div className="hero-metrics-grid">
						<Stat value={String(data?.summary.totalProjects ?? "—")} label="Curated repos" />
						<Stat value={String(data?.summary.totalStars ?? "—")} label="GitHub stars" />
						<Stat value={String(data?.summary.featuredProjects ?? "—")} label="Featured builds" />
						<Stat value={String(data?.summary.activeLanguages ?? "—")} label="Working languages" />
					</div>
					<p className="muted" style={{ marginTop: "1rem" }}>
						Synced from GitHub into D1 and ranked automatically by recency,
						quality signals, and owner curation.
					</p>
					<div className="hero-mini-feed">
						{data?.topLanguages?.slice(0, 3).map((item) => (
							<div key={item.name} className="mini-feed-row">
								<span>{item.name}</span>
								<strong>{item.count}</strong>
							</div>
						)) ?? <SkeletonLines count={3} />}
					</div>
				</div>
			</section>

			<section className="grid-two">
				<div className="glass-panel">
					<p className="eyebrow">Selected work</p>
					<h2>Projects curated from live GitHub data</h2>
					<p className="muted">
						Strong repositories rise automatically; the admin dashboard can
						refine copy, tags, imagery, and ordering without touching the
						database manually.
					</p>
				</div>
				<div className="glass-panel">
					<p className="eyebrow">Access model</p>
					<h2>Private project library, public product studio front door</h2>
					<p className="muted">
						Google sign-in creates an account. Admin-approved roles unlock the
						full project library, user management, sync controls, and audit
						views.
					</p>
				</div>
			</section>

			<section className="section-stack">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Featured projects</p>
						<h2>Premium case-study cards with health, tags, and launch signals</h2>
					</div>
					<Link to="/projects" className="btn btn-sm">
						Open the project library
					</Link>
				</div>

				{error ? (
					<div className="glass-panel notice notice-danger" role="alert">
						<strong>Could not load featured work.</strong>
						<p className="muted">{error}</p>
					</div>
				) : null}

				{loading ? (
					<div className="project-grid">
						{Array.from({ length: 3 }, (_, index) => (
							<ProjectSkeleton key={index} />
						))}
					</div>
				) : null}

				{!loading && projects.length > 0 ? (
					<div className="project-grid">
						{projects.map((project) => (
							<ProjectCard key={project.id} project={project} />
						))}
					</div>
				) : null}

				{!loading && projects.length === 0 && !error ? (
					<div className="glass-panel empty-state">
						<strong>The project showcase is warming up.</strong>
						<p className="muted">
							Once repositories are synced, the strongest work appears here
							automatically.
						</p>
					</div>
				) : null}
			</section>

			<section className="grid-two insights-grid">
				<div className="glass-panel">
					<p className="eyebrow">Top technologies</p>
					<div className="pill-cloud">
						{data?.topTopics.length ? (
							data.topTopics.map((topic) => (
								<span key={topic.name} className="tag-chip tag-chip-large">
									{topic.name} <strong>{topic.count}</strong>
								</span>
							))
						) : (
							<SkeletonLines count={4} />
						)}
					</div>
				</div>
				<div className="glass-panel">
					<p className="eyebrow">Why teams use this portfolio</p>
					<ul className="feature-list">
						<li>Fast, Cloudflare-friendly architecture with lightweight assets</li>
						<li>Automatic repository scoring plus editorial controls</li>
						<li>Secure admin workflows, audit trail, and notification center</li>
						<li>PWA-ready shell, offline states, and update awareness</li>
					</ul>
				</div>
			</section>
		</div>
	);
}

function Stat({ value, label }: { value: string; label: string }) {
	return (
		<div className="stat-card stat-card-inline">
			<strong>{value}</strong>
			<span>{label}</span>
		</div>
	);
}

function SkeletonLines({ count }: { count: number }) {
	return (
		<>
			{Array.from({ length: count }, (_, index) => (
				<div key={index} className="skeleton" style={{ height: "1rem", marginTop: index ? "0.6rem" : 0 }} />
			))}
		</>
	);
}

function ProjectSkeleton() {
	return (
		<div className="glass-panel">
			<div className="skeleton project-skeleton-media" />
			<div className="skeleton" style={{ height: "1.4rem", marginTop: "1rem", width: "62%" }} />
			<div className="skeleton" style={{ height: "1rem", marginTop: "0.8rem" }} />
			<div className="skeleton" style={{ height: "1rem", marginTop: "0.55rem", width: "84%" }} />
		</div>
	);
}
