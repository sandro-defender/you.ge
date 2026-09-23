import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { apiSend, useApi } from "../../lib/use-api";
import { SyncNowButton } from "../../components/SyncNowButton";
import type { AdminRepo } from "../../lib/types";

/**
 * Project curation.
 *
 * These four fields — featured, hidden, sortOrder, customDescription — are the
 * ONLY columns the GitHub cron sync never overwrites (see the `set` list in
 * src/server/github-sync.ts). So a curation decision made here survives every
 * automatic refresh indefinitely.
 *
 * ── OPTIMISTIC UI + ROLLBACK (R5) ──────────────────────────────────────────
 * Toggles and reordering apply to a LOCAL copy of the rows immediately and
 * PATCH in the background; on failure the previous snapshot is restored and
 * the error surfaces (notice + no silent divergence from the database). The
 * sync button owns its own pending state and result toast
 * (components/SyncNowButton).
 */
export const Route = createFileRoute("/admin/repos")({
	head: () => ({ meta: [{ title: "Projects — you.ge admin" }] }),
	component: AdminRepos,
});

/** Matches the server-side cap in src/server/admin-router.ts. */
const DESCRIPTION_MAX = 200;

function AdminRepos() {
	const { data, error, loading, refetch } = useApi<{ repos: AdminRepo[] }>(
		"/api/admin/repos",
	);
	const [rows, setRows] = useState<AdminRepo[]>([]);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	// Per-repo custom-description drafts (controlled textareas, so the char
	// counter can render live). Cleared whenever fresh server data arrives.
	const [drafts, setDrafts] = useState<Record<number, string>>({});

	// Server data is the source of truth; the local copy exists so optimistic
	// updates can render instantly instead of waiting for the refetch.
	useEffect(() => {
		if (data?.repos) {
			setRows(data.repos);
			setDrafts({});
		}
	}, [data]);

	/**
	 * Optimistic patch: apply locally, send, and roll back on failure.
	 * The previous snapshot (not a diff) is restored — simpler and immune to
	 * interleaved updates on other rows.
	 */
	async function optimisticPatch(
		id: number,
		patch: Partial<Pick<AdminRepo, "featured" | "hidden" | "sortOrder" | "customDescription">>,
	) {
		const before = rows;
		setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
		setBusyId(id);
		setActionError(null);
		try {
			await apiSend(`/api/admin/repos/${id}`, { method: "PATCH", body: patch });
			// Success: the optimistic state IS the server state — no refetch
			// needed, which is the whole point of optimistic UI.
		} catch (err) {
			setRows(before);
			setActionError(err instanceof Error ? err.message : "Update failed");
		} finally {
			setBusyId(null);
		}
	}

	/**
	 * Move a repo one slot in the RENDERED order. sortOrder swaps with the
	 * neighbour's; equal values (the common case — everything defaults to 0)
	 * get a nudge so the swap actually changes the sort. Two PATCHes: if the
	 * second fails, refetch — the first already landed and local guessing
	 * would drift from the database.
	 */
	async function move(index: number, direction: -1 | 1) {
		const neighbour = rows[index + direction];
		const moving = rows[index];
		if (!moving || !neighbour) return;

		const before = rows;
		let movingTo = neighbour.sortOrder;
		let neighbourTo = moving.sortOrder;
		if (movingTo === neighbourTo) {
			movingTo = direction === -1 ? neighbour.sortOrder - 1 : neighbour.sortOrder + 1;
		}

		setRows((rs) => {
			const next = [...rs];
			next[index] = { ...moving, sortOrder: movingTo };
			next[index + direction] = { ...neighbour, sortOrder: neighbourTo };
			return next;
		});
		setBusyId(moving.id);
		setActionError(null);
		try {
			await apiSend(`/api/admin/repos/${moving.id}`, {
				method: "PATCH",
				body: { sortOrder: movingTo },
			});
			await apiSend(`/api/admin/repos/${neighbour.id}`, {
				method: "PATCH",
				body: { sortOrder: neighbourTo },
			});
		} catch (err) {
			setRows(before);
			setActionError(err instanceof Error ? err.message : "Reorder failed");
			void refetch(); // first PATCH may have landed — restore server truth
		} finally {
			setBusyId(null);
		}
	}

	// Featured repos always sort above the rest (ORDER BY featured DESC,
	// sort_order — see admin-router / repos_visible_sort_idx), so a move that
	// would cross the featured boundary is impossible by sortOrder alone.
	// These buttons disable at the boundary instead of failing silently.
	const crossFeaturedTier = (i: number, dir: -1 | 1): boolean => {
		const neighbour = rows[i + dir];
		const current = rows[i];
		if (!neighbour || !current) return false;
		return current.featured !== neighbour.featured;
	};

	return (
		<div>
			<div className="spread" style={{ marginBottom: "1rem" }}>
				<h2 style={{ margin: 0 }}>Projects</h2>
				<div className="row">
					<SyncNowButton onFinished={refetch} />
					<button
						type="button"
						className="btn btn-sm"
						onClick={refetch}
						disabled={loading}
					>
						{loading ? <span className="spinner" /> : "Refresh"}
					</button>
				</div>
			</div>

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

			{loading && rows.length === 0 ? (
				<p className="dim">
					<span
						className="spinner"
						style={{ display: "inline-block", verticalAlign: "middle" }}
					/>{" "}
					Loading repositories…
				</p>
			) : null}

			{!loading && rows.length === 0 && !error ? (
				<div className="notice notice-warning">
					<strong>No repositories in the database yet.</strong>
					<p className="muted" style={{ margin: "0.4rem 0 0" }}>
						Click “Sync from GitHub now”, or wait for the cron trigger (every 6
						hours). Check that <code>GITHUB_USERNAME</code> is set in
						wrangler.jsonc and <code>GITHUB_TOKEN</code> is set as a secret.
					</p>
				</div>
			) : null}

			{rows.length > 0 ? (
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
							{rows.map((repo, index) => (
								<tr key={repo.id}>
									<td>
										<div style={{ fontWeight: 550 }}>{repo.slug}</div>
										<div className="dim">
											★ {repo.stars} · {repo.language ?? "—"}
										</div>
									</td>

									<td>
										<div className="row" style={{ flexWrap: "nowrap" }}>
											{busyId === repo.id ? <span className="spinner" /> : null}
											<button
												type="button"
												className="btn btn-sm"
												aria-label={`Move ${repo.name} up`}
												title="Move up"
												disabled={busyId === repo.id || index === 0 || crossFeaturedTier(index, -1)}
												onClick={() => void move(index, -1)}
											>
												↑
											</button>
											<button
												type="button"
												className="btn btn-sm"
												aria-label={`Move ${repo.name} down`}
												title="Move down"
												disabled={busyId === repo.id || index === rows.length - 1 || crossFeaturedTier(index, 1)}
												onClick={() => void move(index, 1)}
											>
												↓
											</button>
											<span className="dim" style={{ fontVariantNumeric: "tabular-nums" }}>
												#{repo.sortOrder}
											</span>
										</div>
									</td>

									<td>
										<Toggle
											checked={repo.featured}
											disabled={busyId === repo.id}
											label={`Feature ${repo.name}`}
											onChange={() =>
												void optimisticPatch(repo.id, { featured: !repo.featured })
											}
										/>
									</td>

									<td>
										<Toggle
											checked={repo.hidden}
											disabled={busyId === repo.id}
											label={`Hide ${repo.name}`}
											onChange={() =>
												void optimisticPatch(repo.id, { hidden: !repo.hidden })
											}
										/>
									</td>

									<td>
										{(() => {
											const value = drafts[repo.id] ?? repo.customDescription ?? "";
											return (
												<>
													<textarea
														className="textarea"
														style={{ minHeight: "3.2rem", fontSize: "0.85rem" }}
														placeholder={repo.description ?? "GitHub description"}
														value={value}
														maxLength={DESCRIPTION_MAX}
														disabled={busyId === repo.id}
														aria-label={`Custom description for ${repo.name}`}
														onChange={(e) =>
															setDrafts((d) => ({ ...d, [repo.id]: e.target.value }))
														}
														// Commit on blur rather than on every
														// keystroke — each keystroke would be a
														// D1 write, and Workers Free caps writes
														// at 100k rows/day.
														onBlur={() => {
															const current = repo.customDescription ?? "";
															if (value !== current) {
																void optimisticPatch(repo.id, {
																	customDescription: value === "" ? null : value,
																});
															}
														}}
													/>
													<div
														className="dim"
														style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}
													>
														{value.length}/{DESCRIPTION_MAX} chars · replaces the
														GitHub description on /projects
													</div>
												</>
											);
										})()}
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
