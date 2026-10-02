import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SyncNowButton } from "../../components/SyncNowButton";
import { Toast, useToast } from "../../components/Toast";
import type { AdminRepo, SyncRun } from "../../lib/types";
import { apiSend, useApi } from "../../lib/use-api";

export const Route = createFileRoute("/admin/repos")({
	head: () => ({ meta: [{ title: "Projects — you.ge admin" }] }),
	component: AdminRepos,
});

type RepoForm = {
	featuredOverride: "auto" | "on" | "off";
	hidden: boolean;
	showOnHomepage: boolean;
	sortOrder: number;
	manualPriority: number;
	customTitle: string;
	customDescription: string;
	customTags: string;
	customImage: string;
	imageAlt: string;
	category: string;
	challenge: string;
	solution: string;
	caseStudy: string;
};

function AdminRepos() {
	const { data, error, loading, refetch } = useApi<{ repos: AdminRepo[] }>("/api/admin/repos");
	const { data: syncData, refetch: refetchSync } = useApi<{ runs: SyncRun[] }>("/api/admin/sync-log");
	const { toast, show, dismiss } = useToast();
	const repos = data?.repos ?? [];
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [form, setForm] = useState<RepoForm | null>(null);
	const [saving, setSaving] = useState(false);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return repos.filter((repo) => {
			if (!needle) return true;
			return `${repo.slug} ${repo.title} ${repo.tags.join(" ")}`.toLowerCase().includes(needle);
		});
	}, [repos, query]);

	const selected = useMemo(() => {
		if (selectedId === null) return filtered[0] ?? repos[0] ?? null;
		return repos.find((repo) => repo.id === selectedId) ?? filtered[0] ?? repos[0] ?? null;
	}, [selectedId, repos, filtered]);

	useEffect(() => {
		if (!selected) return;
		setSelectedId(selected.id);
		setForm(toForm(selected));
	}, [selected?.id]);

	async function save() {
		if (!selected || !form) return;
		setSaving(true);
		try {
			await apiSend(`/api/admin/repos/${selected.id}`, {
				method: "PATCH",
				body: {
					featuredOverride:
						form.featuredOverride === "auto"
							? null
							: form.featuredOverride === "on",
					hidden: form.hidden,
					showOnHomepage: form.showOnHomepage,
					sortOrder: form.sortOrder,
					manualPriority: form.manualPriority,
					customTitle: emptyToNull(form.customTitle),
					customDescription: emptyToNull(form.customDescription),
					customTags: splitTags(form.customTags),
					customImage: emptyToNull(form.customImage),
					imageAlt: emptyToNull(form.imageAlt),
					category: emptyToNull(form.category),
					challenge: emptyToNull(form.challenge),
					solution: emptyToNull(form.solution),
					caseStudy: emptyToNull(form.caseStudy),
				},
			});
			show("success", "Project curation saved.");
			await Promise.all([refetch(), refetchSync()]);
		} catch (err) {
			show("error", err instanceof Error ? err.message : "Could not save project settings.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="page-stack">
			<div className="glass-panel admin-toolbar">
				<div>
					<p className="eyebrow">Project curation</p>
					<h2>Automatic ranking, manual polish</h2>
					<p className="muted">
						GitHub stays the source of truth. Use overrides only for the story,
						presentation, and ordering you want the portfolio to emphasise.
					</p>
				</div>
				<div className="row">
					<SyncNowButton onFinished={() => { refetch(); refetchSync(); }} label="Sync now" />
					<button type="button" className="btn btn-sm" onClick={() => { refetch(); refetchSync(); }} disabled={loading}>
						{loading ? <span className="spinner" /> : "Refresh data"}
					</button>
				</div>
			</div>

			{error ? (
				<div className="glass-panel notice notice-danger" role="alert">
					{error}
				</div>
			) : null}

			<div className="repo-layout">
				<aside className="glass-panel repo-list-panel">
					<div className="spread" style={{ marginBottom: "0.9rem" }}>
						<h3 style={{ margin: 0 }}>Repositories</h3>
						<span className="badge">{repos.length}</span>
					</div>
					<input
						className="input"
						type="search"
						placeholder="Search repositories…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					<div className="repo-list">
						{filtered.map((repo) => (
							<button
								key={repo.id}
								type="button"
								className={`repo-list-item ${selected?.id === repo.id ? "is-active" : ""}`}
								onClick={() => {
									setSelectedId(repo.id);
									setForm(toForm(repo));
								}}
							>
								<div>
									<strong>{repo.title}</strong>
									<span>{repo.slug}</span>
								</div>
								<div className="row row-tight">
									{repo.featured ? <span className="badge badge-accent">Featured</span> : null}
									{repo.hidden ? <span className="badge badge-danger">Hidden</span> : null}
								</div>
							</button>
						))}
					</div>
				</aside>

				<section className="glass-panel repo-editor-panel">
					{selected && form ? (
						<>
							<div className="spread" style={{ marginBottom: "1rem" }}>
								<div>
									<p className="eyebrow">Editing repository</p>
									<h3>{selected.slug}</h3>
									<p className="muted">
										Score {selected.score}/100 · {selected.healthLabel} · ★ {selected.stars}
									</p>
								</div>
								<button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
									{saving ? <span className="spinner" /> : "Save changes"}
								</button>
							</div>

							<div className="field-grid two-up">
								<label className="field-label">
									<span>Featured mode</span>
									<select
										className="select"
										value={form.featuredOverride}
										onChange={(event) => setForm((current) => current && { ...current, featuredOverride: event.target.value as RepoForm["featuredOverride"] })}
									>
										<option value="auto">Automatic</option>
										<option value="on">Force featured</option>
										<option value="off">Never feature</option>
									</select>
								</label>
								<label className="field-label">
									<span>Manual priority</span>
									<input
										className="input"
										type="number"
										min={-3}
										max={5}
										value={form.manualPriority}
										onChange={(event) => setForm((current) => current && { ...current, manualPriority: Number(event.target.value) })}
									/>
								</label>
								<label className="field-label">
									<span>Sort order</span>
									<input
										className="input"
										type="number"
										value={form.sortOrder}
										onChange={(event) => setForm((current) => current && { ...current, sortOrder: Number(event.target.value) })}
									/>
								</label>
								<div className="field-label">
									<span>Visibility</span>
									<div className="toggle-row">
										<label className="checkbox-row"><input type="checkbox" checked={form.showOnHomepage} onChange={(event) => setForm((current) => current && { ...current, showOnHomepage: event.target.checked })} /> Show on homepage</label>
										<label className="checkbox-row"><input type="checkbox" checked={form.hidden} onChange={(event) => setForm((current) => current && { ...current, hidden: event.target.checked })} /> Hide from public views</label>
									</div>
								</div>
							</div>

							<div className="field-grid two-up">
								<label className="field-label">
									<span>Custom title</span>
									<input className="input" value={form.customTitle} onChange={(event) => setForm((current) => current && { ...current, customTitle: event.target.value })} placeholder={selected.name} />
								</label>
								<label className="field-label">
									<span>Category</span>
									<input className="input" value={form.category} onChange={(event) => setForm((current) => current && { ...current, category: event.target.value })} placeholder="Product studio, tooling, OSS…" />
								</label>
							</div>

							<label className="field-label">
								<span>Homepage blurb</span>
								<textarea className="textarea" value={form.customDescription} onChange={(event) => setForm((current) => current && { ...current, customDescription: event.target.value })} placeholder={selected.githubDescription ?? "Tell the story behind this repository."} />
							</label>

							<label className="field-label">
								<span>Tags</span>
								<input className="input" value={form.customTags} onChange={(event) => setForm((current) => current && { ...current, customTags: event.target.value })} placeholder={selected.tags.join(", ")} />
							</label>

							<div className="field-grid two-up">
								<label className="field-label">
									<span>Custom image URL</span>
									<input className="input" value={form.customImage} onChange={(event) => setForm((current) => current && { ...current, customImage: event.target.value })} placeholder="/brand/project-preview.png or https://…" />
								</label>
								<label className="field-label">
									<span>Image alt text</span>
									<input className="input" value={form.imageAlt} onChange={(event) => setForm((current) => current && { ...current, imageAlt: event.target.value })} placeholder="Describe the screenshot for assistive tech" />
								</label>
							</div>

							<div className="field-grid two-up">
								<label className="field-label">
									<span>Challenge</span>
									<textarea className="textarea" value={form.challenge} onChange={(event) => setForm((current) => current && { ...current, challenge: event.target.value })} />
								</label>
								<label className="field-label">
									<span>Solution</span>
									<textarea className="textarea" value={form.solution} onChange={(event) => setForm((current) => current && { ...current, solution: event.target.value })} />
								</label>
							</div>

							<label className="field-label">
								<span>Case study</span>
								<textarea className="textarea textarea-large" value={form.caseStudy} onChange={(event) => setForm((current) => current && { ...current, caseStudy: event.target.value })} placeholder="Explain the outcome, product decisions, and what makes this repo worth exploring." />
							</label>

							<div className="metrics-stack compact-metrics">
								<Breakdown label="Activity" value={selected.scoreBreakdown.activity} />
								<Breakdown label="Stars" value={selected.scoreBreakdown.stars} />
								<Breakdown label="Description" value={selected.scoreBreakdown.description} />
								<Breakdown label="Topics" value={selected.scoreBreakdown.topics} />
								<Breakdown label="Homepage" value={selected.scoreBreakdown.homepage} />
								<Breakdown label="Priority" value={selected.scoreBreakdown.priority} />
							</div>
						</>
					) : (
						<div className="empty-state">
							<strong>No repositories yet.</strong>
							<p className="muted">Run a sync to import projects from GitHub.</p>
						</div>
					)}
				</section>

				<aside className="glass-panel repo-sync-panel">
					<p className="eyebrow">Recent sync history</p>
					<h3>Runs and rate-limit context</h3>
					<ul className="timeline-list">
						{(syncData?.runs ?? []).slice(0, 8).map((run) => (
							<li key={run.id}>
								<span className={`badge ${run.status === "ok" ? "badge-success" : run.status === "error" ? "badge-danger" : run.status === "running" ? "badge-accent" : ""}`}>
									{run.status}
								</span>
								<div>
									<strong>{new Date(run.runAt).toLocaleString()}</strong>
									<span>{run.message ?? `${run.repoCount} repositories processed.`}</span>
									{run.rateLimitLimit ? (
										<span>Rate limit: {run.rateLimitRemaining}/{run.rateLimitLimit}</span>
									) : null}
								</div>
							</li>
						))}
					</ul>
				</aside>
			</div>
			<Toast toast={toast} dismiss={dismiss} />
		</div>
	);
}

function Breakdown({ label, value }: { label: string; value: number }) {
	return (
		<div className="metric-inline metric-inline-wide">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function toForm(repo: AdminRepo): RepoForm {
	return {
		featuredOverride:
			repo.featuredOverride === null ? "auto" : repo.featuredOverride ? "on" : "off",
		hidden: repo.hidden,
		showOnHomepage: repo.showOnHomepage,
		sortOrder: repo.sortOrder,
		manualPriority: repo.manualPriority,
		customTitle: repo.customTitle ?? "",
		customDescription: repo.customDescription ?? "",
		customTags: repo.customTags.join(", "),
		customImage: repo.customImage ?? "",
		imageAlt: repo.imageAlt ?? "",
		category: repo.category ?? "",
		challenge: repo.challenge ?? "",
		solution: repo.solution ?? "",
		caseStudy: repo.caseStudy ?? "",
	};
}

function splitTags(value: string) {
	const items = value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	return items.length ? items : null;
}

function emptyToNull(value: string) {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}
