import { Link, createFileRoute } from "@tanstack/react-router";
import { ProjectCard } from "../components/ProjectCard";
import { relativeTimeLabel } from "../lib/repo-ranking";
import type { PublicProjectDetail } from "../lib/types";
import { useApi } from "../lib/use-api";

export const Route = createFileRoute("/projects/$owner/$name")({
	head: () => ({ meta: [{ title: "Project detail — you.ge" }] }),
	component: ProjectDetailPage,
});

function ProjectDetailPage() {
	const params = Route.useParams();
	const { data, error, loading, refetch } = useApi<{ project: PublicProjectDetail }>(
		`/api/projects/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
	);
	const project = data?.project;

	return (
		<div className="page-stack">
			{error ? (
				<div className="glass-panel notice notice-danger" role="alert">
					<strong>Could not load that project.</strong>
					<p className="muted">{error}</p>
					<div className="row">
						<button type="button" className="btn btn-sm" onClick={refetch}>
							Try again
						</button>
						<Link to="/projects" className="btn btn-sm">
							Back to projects
						</Link>
					</div>
				</div>
			) : null}

			{loading || !project ? (
				<div className="glass-panel project-detail-shell">
					<div className="skeleton project-skeleton-media" />
					<div className="skeleton" style={{ height: "2.1rem", marginTop: "1.2rem", width: "56%" }} />
					<div className="skeleton" style={{ height: "1rem", marginTop: "1rem" }} />
					<div className="skeleton" style={{ height: "1rem", marginTop: "0.6rem", width: "88%" }} />
				</div>
			) : null}

			{project ? (
				<>
					<section className="project-hero glass-panel">
						<div className="project-hero-copy">
							<div className="row row-tight" style={{ marginBottom: "0.9rem" }}>
								{project.featured ? <span className="badge badge-accent">Featured</span> : null}
								<span className="badge health-pill">{project.healthLabel}</span>
								{project.category ? <span className="badge">{project.category}</span> : null}
							</div>
							<h1>{project.title}</h1>
							<p className="hero-lead">{project.description ?? "Curated from GitHub with room for a richer case study."}</p>
							<div className="pill-cloud" style={{ marginTop: "1rem" }}>
								{project.tags.map((tag) => (
									<span key={tag} className="tag-chip tag-chip-large">
										{tag}
									</span>
								))}
							</div>
							<div className="row" style={{ marginTop: "1.25rem" }}>
								<a className="btn btn-primary" href={project.url} target="_blank" rel="noreferrer noopener">
									Open GitHub ↗
								</a>
								{project.homepage ? (
									<a className="btn" href={project.homepage} target="_blank" rel="noreferrer noopener">
										Visit live demo ↗
									</a>
								) : null}
								<Link to="/projects" className="btn">
									More projects
								</Link>
							</div>
						</div>
						<div className="project-hero-media">
							{project.image ? (
								<img src={project.image} alt={project.imageAlt ?? ""} loading="eager" width={900} height={630} />
							) : (
								<div className="project-media-placeholder project-media-placeholder-large">
									<div className="project-media-grid" />
									<div className="project-media-content">
										<span className="badge badge-accent">{project.language ?? "Repository"}</span>
										<strong>{project.title}</strong>
										<span>{project.healthLabel}</span>
									</div>
								</div>
							)}
						</div>
					</section>

					<section className="grid-two detail-grid">
						<div className="glass-panel">
							<p className="eyebrow">Challenge</p>
							<h2>What the project needed to solve</h2>
							<p className="muted">
								{project.challenge ??
									project.githubDescription ??
									"The repository brief comes directly from GitHub metadata, with space for a richer case-study narrative from the admin dashboard."}
							</p>
						</div>
						<div className="glass-panel">
							<p className="eyebrow">Solution</p>
							<h2>How the build comes together</h2>
							<p className="muted">
								{project.solution ??
									"The portfolio blends live GitHub data, curated storytelling, and health signals so standout repositories can be understood quickly."}
							</p>
						</div>
					</section>

					<section className="grid-two detail-grid">
						<div className="glass-panel">
							<p className="eyebrow">Repository health</p>
							<div className="metrics-stack">
								<DetailMetric label="Stars" value={String(project.stars)} />
								<DetailMetric label="Forks" value={String(project.forks)} />
								<DetailMetric label="Open issues" value={String(project.openIssues)} />
								<DetailMetric label="Health score" value={`${project.score}/100`} />
								<DetailMetric label="Last update" value={relativeTimeLabel(project.pushedAt)} />
							</div>
						</div>
						<div className="glass-panel">
							<p className="eyebrow">Case study</p>
							<h2>Editorial notes</h2>
							<p className="muted">
								{project.caseStudy ??
									"Add a bespoke case study in the admin dashboard to capture product decisions, implementation trade-offs, and launch outcomes."}
							</p>
						</div>
					</section>

					{project.related.length > 0 ? (
						<section className="section-stack">
							<div className="section-heading">
								<div>
									<p className="eyebrow">Related work</p>
									<h2>More projects with similar technologies and momentum</h2>
								</div>
							</div>
							<div className="project-grid">
								{project.related.map((item) => (
									<ProjectCard key={item.id} project={item} compact />
								))}
							</div>
						</section>
					) : null}
				</>
			) : null}
		</div>
	);
}

function DetailMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="metric-inline metric-inline-wide">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}
