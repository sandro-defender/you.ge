import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { apiSend, useApi } from "../../lib/use-api";
import type { AdminRepo } from "../../lib/types";

/**
 * Project curation.
 *
 * These four fields — featured, hidden, sortOrder, customDescription — are the
 * ONLY columns the GitHub cron sync never overwrites (see the `set` list in
 * src/server/github-sync.ts). So a curation decision made here survives every
 * automatic refresh indefinitely.
 */
export const Route = createFileRoute("/admin/repos")({
	head: () => ({ meta: [{ title: "Projects — you.ge admin" }] }),
	component: AdminRepos,
});

function AdminRepos() {
	const { data, error, loading, refetch } = useApi<{ repos: AdminRepo[] }>(
		"/api/admin/repos",
	);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [syncNote, setSyncNote] = useState<string | null>(null);

	const repos = data?.repos ?? [];

	async function patch(id: number, body: Record<string, unknown>) {
		setBusyId(id);
		setActionError(null);
		try {
			await apiSend(`/api/admin/repos/${id}`, { method: "PATCH", body });
			refetch();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Update failed");
		} finally {
			setBusyId(null);
		}
	}

	async function triggerSync() {
		setSyncing(true);
		setSyncNote(null);
		try {
			const res = await apiSend<{ message?: string }>("/api/admin/sync", {
				method: "POST",
			});
			setSyncNote(res.message ?? "Sync started.");
			// The sync runs in the background via ctx.waitUntil, so give it a
			// moment before refreshing the table.
			setTimeout(() => refetch(), 4000);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Sync failed");
		} finally {
			setSyncing(false);
		}
	}

	return (
		<div>
			<div className="spread" style={{ marginBottom: "1rem" }}>
				<h2 style={{ margin: 0 }}>Projects</h2>
				<div className="row">
					<button
						type="button"
						className="btn btn-sm"
						onClick={() => void triggerSync()}
						disabled={syncing}
					>
						{syncing ? <span className="spinner" /> : "Sync from GitHub now"}
					</button>
					<button
						type="button"
						className="btn btn-sm"
						onClick={refetch}
						disabled={loading}
					>
						Refresh
					</button>
				</div>
			</div>

			{syncNote ? <div className="notice">{syncNote}</div> : null}
			{actionError ? (
				<div className="notice notice-danger" role="alert">
					{actionError}
				</div>
			) : null}
			{error ? (
				<div className="notice notice-danger" role="alert">
					{error}
				</div>
			) : null}

			{loading && repos.length === 0 ? (
				<p className="dim">
					<span
						className="spinner"
						style={{ display: "inline-block", verticalAlign: "middle" }}
					/>{" "}
					Loading repositories…
				</p>
			) : null}

			{!loading && repos.length === 0 && !error ? (
				<div className="notice notice-warning">
					<strong>No repositories in the database yet.</strong>
					<p className="muted" style={{ margin: "0.4rem 0 0" }}>
						Click “Sync from GitHub now”, or wait for the cron trigger (every 6
						hours). Check that <code>GITHUB_USERNAME</code> is set in
						wrangler.jsonc and <code>GITHUB_TOKEN</code> is set as a secret.
					</p>
				</div>
			) : null}

			{repos.length > 0 ? (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Repository</th>
								<th>Order</th>
								<th>Featured</th>
								<th>Hidden</th>
								<th>Custom description</th>
							</tr>
						</thead>
						<tbody>
							{repos.map((repo) => (
								<tr key={repo.id}>
									<td>
										<div style={{ fontWeight: 550 }}>{repo.slug}</div>
										<div className="dim">
											★ {repo.stars} · {repo.language ?? "—"}
										</div>
									</td>

									<td>
										<input
											className="input"
											type="number"
											style={{ width: "5.5rem", padding: "0.3rem 0.5rem" }}
											value={repo.sortOrder}
											disabled={busyId === repo.id}
											onChange={(e) =>
												void patch(repo.id, {
													sortOrder: Number(e.target.value) || 0,
												})
											}
										/>
									</td>

									<td>
										<Toggle
											checked={repo.featured}
											disabled={busyId === repo.id}
											label={`Feature ${repo.name}`}
											onChange={() =>
												void patch(repo.id, { featured: !repo.featured })
											}
										/>
									</td>

									<td>
										<Toggle
											checked={repo.hidden}
											disabled={busyId === repo.id}
											label={`Hide ${repo.name}`}
											onChange={() => void patch(repo.id, { hidden: !repo.hidden })}
										/>
									</td>

									<td>
										<textarea
											className="textarea"
											style={{ minHeight: "3.2rem", fontSize: "0.85rem" }}
											placeholder={repo.description ?? "GitHub description"}
											defaultValue={repo.customDescription ?? ""}
											disabled={busyId === repo.id}
											// Commit on blur rather than on every
											// keystroke — each keystroke would be a
											// D1 write, and Workers Free caps writes
											// at 100k rows/day.
											onBlur={(e) => {
												const value = e.target.value;
												const current = repo.customDescription ?? "";
												if (value !== current) {
													void patch(repo.id, {
														customDescription: value === "" ? null : value,
													});
												}
											}}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}

function Toggle({
	checked,
	disabled,
	onChange,
	label,
}: {
	checked: boolean;
	disabled: boolean;
	onChange: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			onClick={onChange}
			disabled={disabled}
			className="badge"
			style={{
				cursor: disabled ? "not-allowed" : "pointer",
				background: checked ? "var(--accent-soft)" : "var(--bg-hover)",
				color: checked ? "var(--accent-hover)" : "var(--text-dim)",
				border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
				font: "inherit",
				fontSize: "0.78rem",
				padding: "0.25rem 0.6rem",
			}}
		>
			{checked ? "on" : "off"}
		</button>
	);
}
