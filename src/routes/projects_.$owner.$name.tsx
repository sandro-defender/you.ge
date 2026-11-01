import { Link, createFileRoute } from "@tanstack/react-router";
import { InlineIcon } from "../components/InlineIcon";
import { ProjectCard } from "../components/ProjectCard";
import { relativeTimeLabel } from "../lib/repo-ranking";
import type { PublicProjectDetail } from "../lib/types";
import { useApi } from "../lib/use-api";

export const Route = createFileRoute("/projects_/$owner/$name")({
	head: () => ({ meta: [{ title: "Project notes — you.ge" }] }),
	component: ProjectDetailPage,
});

function ProjectDetailPage() {
	const params = Route.useParams();
	const { data, error, loading, refetch } = useApi<{ project: PublicProjectDetail }>(
		`/api/projects/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.name)}`,
	);
	const project = data?.project;

	return (
		<div className="page-stack archive-detail-page">
			{error ? (
				<div className="glass-panel notice notice-danger" role="alert">
					<strong>Could not load that project.</strong>
					<p className="muted">{error}</p>
					<div className="row">
						<button type="button" className="btn btn-sm" onClick={refetch}>Try again</button>
						<Link to="/projects" reloadDocument className="btn btn-sm">Back to archive</Link>
					</div>
				</div>
			) : null}

			{loading && !project ? (
				<div className="glass-panel project-detail-shell">
					<div className="skeleton project-skeleton-media" />
					<div className="skeleton" style={{ height: "2.1rem", marginTop: "1.2rem", width: "56%" }} />
					<div className="skeleton" style={{ height: "1rem", marginTop: "1rem" }} />
					<div className="skeleton" style={{ height: "1rem", marginTop: "0.6rem", width: "88%" }} />
				</div>
			) : null}

			{project ? (
				<>
					<nav className="archive-breadcrumb" aria-label="Breadcrumb">
						<Link to="/projects" reloadDocument><InlineIcon name="arrow-right" size={14} /> Project archive</Link>
						<span>/</span>
						<span>{project.name}</span>
					</nav>

					<section className="archive-detail-hero">
						<div className="archive-detail-copy">
							<div className="archive-detail-badges">
								<span className="archive-kicker">PROJECT NOTES <i>/</i> {project.owner}/{project.name}</span>
								{project.featured ? <span className="badge badge-accent">Featured</span> : null}
							</div>
							<h1>{project.title}</h1>
							<p className="archive-detail-description">
								{project.description ?? project.githubDescription ?? "A project in the you.ge archive."}
							</p>
							<div className="archive-detail-tags">
								{project.tags.map((tag) => <span key={tag}>{tag}</span>)}
							</div>
							<div className="archive-link-list" aria-label="Project links">
								<a href={project.url} target="_blank" rel="noreferrer noopener" className="archive-link-tile">
									<span className="archive-link-icon"><InlineIcon name="github" size={18} /></span>
									<span><strong>Source repository</strong><small>Browse code on GitHub</small></span>
									<InlineIcon name="arrow-up-right" size={16} />
								</a>
								{project.homepage ? (
									<a href={project.homepage} target="_blank" rel="noreferrer noopener" className="archive-link-tile">
										<span className="archive-link-icon archive-link-icon-live"><InlineIcon name="globe" size={18} /></span>
										<span><strong>Live project</strong><small>Open the published build</small></span>
										<InlineIcon name="arrow-up-right" size={16} />
									</a>
								) : null}
							</div>
						</div>

						<div className="archive-detail-art">
							{project.image ? (
								<img src={project.image} alt={project.imageAlt ?? `${project.title} preview`} loading="eager" width={900} height={630} />
							) : (
								<div className="archive-detail-art-scene" aria-hidden="true">
									<div className="archive-detail-grid" />
									<div className="archive-detail-orbit archive-detail-orbit-a" />
									<div className="archive-detail-orbit archive-detail-orbit-b" />
									<span className="archive-detail-monogram">{project.language?.slice(0, 2).toUpperCase() ?? "Y."}</span>
									<div className="archive-detail-code"><i /><i /><i /><i /></div>
								</div>
							)}
							<div className="archive-detail-art-label"><span>COLLECTED WORK / 01</span><span>{project.category ?? project.language ?? "PROJECT"}</span></div>
						</div>
					</section>

					<div className="archive-detail-meta" aria-label="Project metadata">
						<DetailMeta label="Language" value={project.language ?? "Not specified"} />
						<DetailMeta label="Updated" value={relativeTimeLabel(project.pushedAt).replace(/^Updated /, "")} />
						<DetailMeta label="Stars" value={String(project.stars)} />
						<DetailMeta label="Health" value={project.healthLabel} />
					</div>

					<section className="archive-detail-body">
						<div className="archive-notes-main">
							<div className="archive-notes-heading">
								<p className="archive-kicker">THE MARGINS <i>/</i> NOTES &amp; CONTEXT</p>
								<h2>What sits behind the build.</h2>
								<p>Briefs, decisions, and the small details that make the project make sense.</p>
							</div>
							<NoteBlock number="01" title="The brief" icon="sparkles">
								{project.challenge ?? "No project brief has been added yet. Add a short note about the problem this project set out to solve."}
							</NoteBlock>
							<NoteBlock number="02" title="The approach" icon="code">
								{project.solution ?? "No implementation notes have been added yet. Capture the choices, trade-offs, or approach that shaped the build."}
							</NoteBlock>
							<NoteBlock number="03" title="Field notes" icon="note">
								{project.caseStudy ?? "No field notes have been added yet. Use the admin project editor to keep useful context alongside the source."}
							</NoteBlock>
						</div>

						<aside className="archive-detail-sidebar">
							<div className="archive-side-card">
								<p className="archive-kicker">AT A GLANCE</p>
								<h3>Project signals</h3>
								<SideMetric label="Stars" value={String(project.stars)} />
								<SideMetric label="Forks" value={String(project.forks)} />
								<SideMetric label="Open issues" value={String(project.openIssues)} />
								<SideMetric label="Health score" value={`${project.score}/100`} />
							</div>
							<div className="archive-side-note">
								<span className="archive-side-note-icon"><InlineIcon name="layers" size={18} /></span>
								<div><strong>Keep the context close.</strong><p>Links and notes stay together, so the next visit starts with the why.</p></div>
							</div>
							<Link to="/projects" reloadDocument className="archive-back-link"><InlineIcon name="arrow-right" size={15} /> Back to the archive</Link>
						</aside>
					</section>

					{project.related.length > 0 ? (
						<section className="section-stack archive-related-section">
							<div className="section-heading">
								<div>
									<p className="archive-kicker">MORE FROM THE INDEX</p>
									<h2>Related projects</h2>
								</div>
							</div>
							<div className="project-grid">
								{project.related.map((item) => <ProjectCard key={item.id} project={item} compact />)}
							</div>
						</section>
					) : null}
				</>
			) : null}
		</div>
	);
}

function DetailMeta({ label, value }: { label: string; value: string }) {
	return <div className="archive-detail-meta-item"><span>{label}</span><strong>{value}</strong></div>;
}

function SideMetric({ label, value }: { label: string; value: string }) {
	return <div className="archive-side-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function NoteBlock({
	number,
	title,
	icon,
	children,
}: {
	number: string;
	title: string;
	icon: "sparkles" | "code" | "note";
	children: string;
}) {
	return (
		<article className="archive-note-block">
			<div className="archive-note-block-head">
				<span className="archive-note-number">{number}</span>
				<span className="archive-note-icon"><InlineIcon name={icon} size={16} /></span>
				<h3>{title}</h3>
			</div>
			<p>{children}</p>
		</article>
	);
}
