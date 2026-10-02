import { Link } from "@tanstack/react-router";
import { relativeTimeLabel } from "../lib/repo-ranking";
import type { PublicProject } from "../lib/types";

export function ProjectCard({
	project,
	compact = false,
}: {
	project: PublicProject;
	compact?: boolean;
}) {
	const to = `/projects/${project.owner}/${project.name}`;

	return (
		<article className={`project-panel ${compact ? "project-panel-compact" : ""}`}>
			<Link to={to} className="project-panel-link" aria-label={`Open ${project.title}`}>
				<div className="project-media" aria-hidden="true">
					{project.image ? (
						<img
							src={project.image}
							alt={project.imageAlt ?? ""}
							loading="lazy"
							width={800}
							height={560}
						/>
					) : (
						<div className="project-media-placeholder">
							<div className="project-media-grid" />
							<div className="project-media-content">
								<span className="badge badge-accent">{project.language ?? "Project"}</span>
								<strong>{project.title}</strong>
								<span>{project.healthLabel}</span>
							</div>
						</div>
					)}
				</div>
			</Link>

			<div className="project-panel-body">
				<div className="project-panel-header">
					<div>
						<div className="row row-tight" style={{ marginBottom: "0.4rem" }}>
							{project.featured ? <span className="badge badge-accent">Featured</span> : null}
							{project.category ? <span className="badge">{project.category}</span> : null}
							<span className="badge health-pill">{project.healthLabel}</span>
						</div>
						<h3 className="project-title">{project.title}</h3>
						<p className="project-subtitle">{project.description ?? "Curated from GitHub and ready for a deeper case study."}</p>
					</div>
				</div>

				<div className="project-tags" aria-label="Technologies">
					{project.tags.slice(0, compact ? 4 : 6).map((tag) => (
						<span key={tag} className="tag-chip">
							{tag}
						</span>
					))}
				</div>

				<div className="project-meta-grid">
					<Metric label="Stars" value={formatCount(project.stars)} />
					<Metric label="Forks" value={formatCount(project.forks)} />
					<Metric label="Issues" value={String(project.openIssues)} />
					<Metric label="Updated" value={relativeTimeLabel(project.pushedAt).replace(/^Updated /, "")} />
				</div>

				<div className="row project-actions">
					<Link to={to} className="btn btn-sm btn-primary">
						Read case study
					</Link>
					<a className="btn btn-sm" href={project.url} target="_blank" rel="noreferrer noopener">
						GitHub ↗
					</a>
					{project.homepage ? (
						<a
							className="btn btn-sm"
							href={project.homepage}
							target="_blank"
							rel="noreferrer noopener"
						>
							Live demo ↗
						</a>
					) : null}
				</div>
			</div>
		</article>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="metric-inline">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function formatCount(value: number) {
	if (value < 1000) return String(value);
	if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
	return `${Math.round(value / 1000)}k`;
}
