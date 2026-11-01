import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { relativeTimeLabel } from "../lib/repo-ranking";
import type { PublicProject } from "../lib/types";
import { InlineIcon } from "./InlineIcon";

const accents = ["#a58aff", "#5ce1bd", "#ffae75", "#75a9ff", "#f18db7", "#b7d56e"];

export function CatalogProjectCard({
	project,
	index,
	canReadNotes,
}: {
	project: PublicProject;
	index: number;
	canReadNotes: boolean;
}) {
	const accentStyle = {
		"--card-accent": accents[index % accents.length],
		"--card-index": index,
	} as CSSProperties;
	const updated = relativeTimeLabel(project.pushedAt).replace(/^Updated /, "");

	return (
		<article className="catalog-project-card" style={accentStyle}>
			<div className="catalog-project-art">
				{project.image ? (
					<img
						src={project.image}
						alt={project.imageAlt ?? `${project.title} preview`}
						loading="lazy"
						width={900}
						height={600}
					/>
				) : (
					<div className="catalog-art-scene" aria-hidden="true">
						<div className="catalog-art-grid" />
						<div className="catalog-art-orbit catalog-art-orbit-one" />
						<div className="catalog-art-orbit catalog-art-orbit-two" />
						<div className="catalog-art-window">
							<div className="catalog-art-window-bar">
								<i />
								<i />
								<i />
								<span>{project.name}</span>
							</div>
							<div className="catalog-art-code">
								<span />
								<span />
								<span />
								<span />
							</div>
						</div>
						<strong className="catalog-art-monogram">{project.language?.slice(0, 2).toUpperCase() ?? "Y."}</strong>
					</div>
				)}
				<div className="catalog-art-topline">
					<span className="catalog-number">INDEX / {String(index + 1).padStart(2, "0")}</span>
					{project.featured ? <span className="catalog-featured-dot"><i /> Featured</span> : null}
				</div>
				{project.category ? <span className="catalog-art-category">{project.category}</span> : null}
			</div>

			<div className="catalog-project-content">
				<div className="catalog-project-title-row">
					<div>
						<p className="catalog-project-owner">{project.owner} <span>/</span> {project.name}</p>
						<h3>{project.title}</h3>
					</div>
					<a
						className="catalog-icon-link"
						href={project.url}
						target="_blank"
						rel="noreferrer noopener"
						aria-label={`Open ${project.title} source on GitHub`}
					>
						<InlineIcon name="arrow-up-right" size={18} />
					</a>
				</div>

				<p className="catalog-project-description">
					{project.description ?? "A work in progress, collected here with its source and useful context."}
				</p>

				<div className="catalog-project-tags" role="list" aria-label="Project tags">
					{(project.tags.length ? project.tags : [project.language ?? "Project"])
						.slice(0, 3)
						.map((tag) => <span key={tag} role="listitem">{tag}</span>)}
				</div>

				<div className="catalog-project-footer">
					<div className="catalog-project-meta">
						<span><InlineIcon name="sparkles" size={14} /> {project.stars} stars</span>
						<span className="catalog-meta-divider" />
						<span>{updated}</span>
					</div>
					<div className="catalog-project-links">
						{project.homepage ? (
							<a href={project.homepage} target="_blank" rel="noreferrer noopener">
								Live <InlineIcon name="arrow-up-right" size={14} />
							</a>
						) : null}
						{canReadNotes ? (
							<Link
								to="/projects/$owner/$name"
								params={{ owner: project.owner, name: project.name }}
								reloadDocument
							>
								Notes <InlineIcon name="arrow-right" size={14} />
							</Link>
						) : (
							<span className="catalog-private-note" title="Project notes are available to approved members">
								<InlineIcon name="lock" size={13} /> Notes
							</span>
						)}
					</div>
				</div>
			</div>
		</article>
	);
}
