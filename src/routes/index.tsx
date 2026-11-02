import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CatalogProjectCard } from "../components/CatalogProjectCard";
import { ElectricLogo } from "../components/ElectricLogo";
import { InlineIcon } from "../components/InlineIcon";
import { useAuthSession } from "../lib/auth-client";
import { trackEvent } from "../lib/analytics";
import { hasRole, PROJECT_ROLES } from "../lib/roles";
import { useApi } from "../lib/use-api";
import type { HomeData } from "../lib/types";

type ProjectFilter = "all" | "featured" | "live";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "you.ge — projects, links & notes" },
			{ name: "robots", content: "index, follow" },
			{
				name: "description",
				content:
					"A considered catalogue of Sandro's projects, useful links, and the notes behind the work.",
			},
			{
				property: "og:title",
				content: "you.ge — projects, links & notes",
			},
			{
				property: "og:description",
				content:
					"A considered catalogue of projects, useful links, and the notes behind the work.",
			},
			{ property: "og:url", content: "https://you.ge/" },
		],
		links: [{ rel: "canonical", href: "https://you.ge/" }],
	}),
	component: Home,
});

function Home() {
	const { user } = useAuthSession();
	const canReadNotes = hasRole(user?.role, PROJECT_ROLES) && !user?.banned;
	const { data, error, loading, refetch } = useApi<HomeData>("/api/public/home");
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<ProjectFilter>("all");
	const searchRef = useRef<HTMLInputElement>(null);
	const projects = data?.featuredProjects ?? [];

	const visibleProjects = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		return projects.filter((project) => {
			const matchesFilter =
				filter === "all" ||
				(filter === "featured" && project.featured) ||
				(filter === "live" && Boolean(project.homepage));
			if (!matchesFilter) return false;
			if (!query) return true;
			const haystack = [
				project.title,
				project.name,
				project.owner,
				project.description,
				project.category,
				project.language,
				...project.tags,
			]
				.filter(Boolean)
				.join(" ")
				.toLocaleLowerCase();
			return haystack.includes(query);
		});
	}, [filter, projects, search]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target;
			const isEditing =
				target instanceof HTMLElement &&
				(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isEditing) return;
			event.preventDefault();
			searchRef.current?.focus();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const projectCount = data?.summary.totalProjects;
	const featuredCount = data?.summary.featuredProjects;
	const languageCount = data?.summary.activeLanguages;

	return (
		<div className="page-stack catalog-page">
			<section className="catalog-hero" aria-labelledby="catalog-heading">
				<div className="catalog-hero-glow" aria-hidden="true" />
				<div className="catalog-hero-copy">
					<div className="catalog-hero-topline">
						<span className="catalog-kicker"><i /> PERSONAL PROJECT INDEX</span>
						<span className="catalog-edition">TBILISI · GEORGIA</span>
					</div>
					<div className="catalog-hero-heading-wrap">
						<p className="catalog-overline">A little corner of the internet</p>
						<h1 id="catalog-heading">
							Projects, links <span>&amp; notes.</span>
						</h1>
					</div>
					<p className="catalog-hero-lead">
						A living index of things I build, useful places I find, and the
						thinking I want to keep close to the work.
					</p>
					<div className="catalog-hero-actions">
						<a
							href="#project-index"
							className="catalog-primary-action"
							onClick={() => trackEvent("home.catalog-scroll")}
						>
							Explore the index <InlineIcon name="arrow-down" size={17} />
						</a>
						<a
							href="https://github.com/sandro-defender"
							target="_blank"
							rel="noreferrer noopener"
							className="catalog-secondary-action"
							onClick={() => trackEvent("home.github")}
						>
							<InlineIcon name="github" size={17} /> GitHub <InlineIcon name="arrow-up-right" size={15} />
						</a>
					</div>
					<div className="catalog-hero-footnote">
						<span className="catalog-live-indicator"><i /> Updated as I build</span>
						<span className="catalog-footnote-separator" />
						<span>Projects are the starting point, not the whole story.</span>
					</div>
				</div>

				<div className="catalog-hero-visual" aria-label="A visual index of projects, links and notes">
					<div className="catalog-orbit catalog-orbit-outer" aria-hidden="true" />
					<div className="catalog-orbit catalog-orbit-inner" aria-hidden="true" />
				<div className="catalog-electric-stage" aria-hidden="true">
					<ElectricLogo
						src="/logo.svg"
						color="#f0eaff"
						glowColor="#8a76ff"
						scale={0.72}
						thickness={1.6}
						strands={4}
						bend={0.6}
						crackle={1.2}
						arcs={1}
						flicker={0.6}
						fill={0.4}
						speed={2.2}
						interactive
						cursorIntensity={0.6}
						cursorRadius={90}
						theme="dark"
					/>
				</div>
					<div className="catalog-float-chip catalog-float-projects">
						<span className="catalog-float-icon"><InlineIcon name="folder" size={17} /></span>
						<span><strong>Projects</strong><small>Things in motion</small></span>
					</div>
					<div className="catalog-float-chip catalog-float-links">
						<span className="catalog-float-icon"><InlineIcon name="link" size={17} /></span>
						<span><strong>Links</strong><small>Useful by design</small></span>
					</div>
					<div className="catalog-float-chip catalog-float-notes">
						<span className="catalog-float-icon"><InlineIcon name="note" size={17} /></span>
						<span><strong>Notes</strong><small>Context worth keeping</small></span>
					</div>
					<div className="catalog-visual-caption"><span>01</span><span>THE WORKING ARCHIVE</span></div>
				</div>
			</section>

			<section className="catalog-stat-strip" aria-label="Project index at a glance">
				<IndexStat label="Projects in orbit" value={loading ? "—" : formatStat(projectCount)} />
				<IndexStat label="Selected builds" value={loading ? "—" : formatStat(featuredCount)} />
				<IndexStat label="Tools & languages" value={loading ? "—" : formatStat(languageCount)} />
				<div className="catalog-stat-aside">
					<span className="catalog-stat-aside-mark">↗</span>
					<span>{data?.summary.lastSyncAt ? "Synced from GitHub, curated by hand." : "Always collecting, always refining."}</span>
				</div>
			</section>

			<section className="catalog-section" id="project-index" aria-labelledby="project-index-heading">
				<div className="catalog-section-heading">
					<div>
						<p className="catalog-section-kicker"><span>01</span> / THE PROJECT INDEX</p>
						<h2 id="project-index-heading">A few things I’ve made.</h2>
						<p className="catalog-section-lead">Small experiments, useful tools, and bigger ideas—collected in one place.</p>
					</div>
					{canReadNotes ? (
						<Link to="/projects" reloadDocument className="catalog-text-link" onClick={() => trackEvent("home.archive")}>
							Open the full archive <InlineIcon name="arrow-up-right" size={16} />
						</Link>
					) : user ? (
						<Link to="/projects" reloadDocument className="catalog-text-link" onClick={() => trackEvent("home.archive-check-access")}>
							Check archive access <InlineIcon name="arrow-up-right" size={16} />
						</Link>
					) : (
						<a href="/login?next=%2Fprojects" className="catalog-text-link" onClick={() => trackEvent("home.archive-signin")}>
							Member archive <InlineIcon name="arrow-up-right" size={16} />
						</a>
					)}
				</div>

				<div className="catalog-toolbar">
					<label className="catalog-search">
						<InlineIcon name="search" size={19} />
						<span className="sr-only">Search projects</span>
						<input
							ref={searchRef}
							type="search"
							value={search}
							placeholder="Search projects, tools, or tags…"
							onChange={(event) => setSearch(event.target.value)}
						/>
						{search ? (
							<button type="button" className="catalog-clear-search" onClick={() => setSearch("")} aria-label="Clear search">
								<InlineIcon name="close" size={16} />
							</button>
						) : <kbd>/</kbd>}
					</label>
					<div className="catalog-filters" role="group" aria-label="Filter projects">
						<FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All work</FilterButton>
						<FilterButton active={filter === "featured"} onClick={() => setFilter("featured")}>Featured</FilterButton>
						<FilterButton active={filter === "live"} onClick={() => setFilter("live")}>With a live link</FilterButton>
					</div>
					<p className="catalog-result-count" role="status">
						{loading ? "Gathering the index…" : `${visibleProjects.length} ${visibleProjects.length === 1 ? "entry" : "entries"}`}
					</p>
				</div>

				{error ? (
					<div className="catalog-state catalog-state-error" role="alert">
						<div className="catalog-state-icon"><InlineIcon name="refresh" size={20} /></div>
						<div><strong>The index is taking a little break.</strong><p>{error}</p></div>
						<button type="button" className="catalog-state-retry" onClick={refetch}>Try again <InlineIcon name="arrow-right" size={15} /></button>
					</div>
				) : null}

				{loading ? (
					<div className="catalog-grid" aria-label="Loading projects">
						{Array.from({ length: 3 }, (_, index) => <CatalogSkeleton key={index} index={index} />)}
					</div>
				) : null}

				{!loading && !error && visibleProjects.length > 0 ? (
					<div className="catalog-grid">
						{visibleProjects.map((project, index) => (
							<CatalogProjectCard
								key={project.id}
								project={project}
								index={index}
								canReadNotes={canReadNotes}
							/>
						))}
					</div>
				) : null}

				{!loading && !error && projects.length > 0 && visibleProjects.length === 0 ? (
					<div className="catalog-state">
						<div className="catalog-state-icon"><InlineIcon name="search" size={20} /></div>
						<div><strong>Nothing in this corner just yet.</strong><p>Try another search, or reset the filters to see the full selection.</p></div>
						<button type="button" className="catalog-state-retry" onClick={() => { setSearch(""); setFilter("all"); }}>Reset filters <InlineIcon name="arrow-right" size={15} /></button>
					</div>
				) : null}

				{!loading && !error && projects.length === 0 ? (
					<div className="catalog-state">
						<div className="catalog-state-icon"><InlineIcon name="folder" size={20} /></div>
						<div><strong>The shelves are being arranged.</strong><p>Featured projects will appear here after the first repository sync.</p></div>
						<a href="https://github.com/sandro-defender" target="_blank" rel="noreferrer noopener" className="catalog-state-retry">Visit GitHub <InlineIcon name="arrow-up-right" size={15} /></a>
					</div>
				) : null}
			</section>

			<section className="catalog-notes-section" aria-labelledby="catalog-notes-heading">
				<div className="catalog-notes-copy">
					<p className="catalog-section-kicker"><span>02</span> / THE MARGINS</p>
					<h2 id="catalog-notes-heading">The useful part is often in the notes.</h2>
					<p>
						Each project can carry its own brief, decisions, implementation notes,
						and useful links—so the why stays close to the what.
					</p>
					{canReadNotes ? (
						<Link to="/projects" reloadDocument className="catalog-notes-link">Browse notes in the archive <InlineIcon name="arrow-right" size={16} /></Link>
					) : user ? (
						<Link to="/projects" reloadDocument className="catalog-notes-link">Check member access <InlineIcon name="arrow-right" size={16} /></Link>
					) : (
						<a href="/login?next=%2Fprojects" className="catalog-notes-link">Sign in for the private archive <InlineIcon name="arrow-right" size={16} /></a>
					)}
					<p className="catalog-private-caption"><InlineIcon name="lock" size={13} /> Detailed project notes remain member-only.</p>
				</div>
				<div className="catalog-notes-card" aria-label="A preview of the project notes structure">
					<div className="catalog-notes-card-head">
						<span className="catalog-note-stamp"><InlineIcon name="note" size={16} /> FIELD NOTES</span>
						<span className="catalog-note-date">PROJECT / CONTEXT</span>
					</div>
					<div className="catalog-note-rule" />
					<NoteRow number="01" title="The brief" detail="What needed to be solved" />
					<NoteRow number="02" title="The approach" detail="Decisions and trade-offs" />
					<NoteRow number="03" title="Useful links" detail="Source, live build, references" />
					<div className="catalog-notes-card-foot"><span>Keep the context.</span><span>Keep building <b>↗</b></span></div>
				</div>
			</section>

			<section className="catalog-endcap" aria-label="About this catalogue">
				<div className="catalog-endcap-mark" aria-hidden="true">y<span>.</span></div>
				<p>Made with curiosity in Tbilisi, Georgia.</p>
				<a href="https://github.com/sandro-defender" target="_blank" rel="noreferrer noopener">Say hello on GitHub <InlineIcon name="arrow-up-right" size={15} /></a>
			</section>
		</div>
	);
}

function IndexStat({ label, value }: { label: string; value: string }) {
	return <div className="catalog-stat"><strong>{value}</strong><span>{label}</span></div>;
}

function FilterButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<button type="button" className={`catalog-filter ${active ? "is-active" : ""}`} aria-pressed={active} onClick={onClick}>
			{children}
		</button>
	);
}

function NoteRow({ number, title, detail }: { number: string; title: string; detail: string }) {
	return (
		<div className="catalog-note-row">
			<span>{number}</span>
			<strong>{title}</strong>
			<small>{detail}</small>
			<InlineIcon name="arrow-up-right" size={15} />
		</div>
	);
}

function CatalogSkeleton({ index }: { index: number }) {
	return (
		<div className="catalog-project-skeleton" style={{ "--skeleton-index": index } as CSSProperties}>
			<div className="catalog-skeleton-art" />
			<div className="catalog-skeleton-copy">
				<div className="catalog-skeleton-line catalog-skeleton-line-short" />
				<div className="catalog-skeleton-line catalog-skeleton-line-title" />
				<div className="catalog-skeleton-line" />
				<div className="catalog-skeleton-line catalog-skeleton-line-medium" />
			</div>
		</div>
	);
}

function formatStat(value: number | undefined) {
	return value === undefined ? "—" : new Intl.NumberFormat("en", { notation: value > 999 ? "compact" : "standard" }).format(value);
}
