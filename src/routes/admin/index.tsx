import { Link, createFileRoute } from "@tanstack/react-router";
import { SyncNowButton } from "../../components/SyncNowButton";
import type { AdminOverview, AuditEntry, NotificationItem } from "../../lib/types";
import { useApi } from "../../lib/use-api";

export const Route = createFileRoute("/admin/")({
	component: AdminHome,
});

function AdminHome() {
	const { data, loading, error, refetch } = useApi<AdminOverview>("/api/admin/overview");
	const overview = data;

	return (
		<div className="page-stack admin-page">
			<div className="spread page-header">
				<div>
					<p className="eyebrow">Control room</p>
					<h2>Portfolio operations at a glance</h2>
					<p className="muted page-subtitle">
						See what changed, sync GitHub safely, and spot actions that need
						attention before they impact the public experience.
					</p>
				</div>
				<div className="row">
					<SyncNowButton onFinished={refetch} label="Sync now" />
					<button type="button" className="btn btn-sm" onClick={refetch} disabled={loading}>
						{loading ? <span className="spinner" /> : "Refresh"}
					</button>
				</div>
			</div>

			{error ? (
				<div className="glass-panel notice notice-danger" role="alert">
					{error}
				</div>
			) : null}

			<div className="stats-grid">
				<DashboardStat label="Repositories" value={String(overview?.totals.repositories ?? "—")} />
				<DashboardStat label="Featured" value={String(overview?.totals.featured ?? "—")} />
				<DashboardStat label="Hidden" value={String(overview?.totals.hidden ?? "—")} />
				<DashboardStat label="Active users" value={String(overview?.totals.activeUsers ?? "—")} />
				<DashboardStat label="Pending actions" value={String(overview?.totals.pendingActions ?? "—")} />
				<DashboardStat label="Failed syncs" value={String(overview?.totals.failedSyncs ?? "—")} />
			</div>

			<div className="admin-grid">
				<section className="glass-panel">
					<div className="spread" style={{ marginBottom: "0.8rem" }}>
						<div>
							<p className="eyebrow">GitHub sync</p>
							<h3>Latest status</h3>
						</div>
						<Link to="/admin/repos" className="btn btn-sm">
							Manage projects
						</Link>
					</div>
					{overview?.lastSync ? (
						<>
							<div className="row row-tight">
								<StatusBadge status={overview.lastSync.status} />
								<span className="badge">{overview.lastSync.trigger}</span>
							</div>
							<p className="muted" style={{ marginTop: "0.8rem" }}>
								{overview.lastSync.message ?? "No message recorded."}
							</p>
							<div className="metrics-stack compact-metrics">
								<DetailRow label="Repos" value={String(overview.lastSync.repoCount)} />
								<DetailRow label="New discoveries" value={String(overview.lastSync.discoveredCount)} />
								<DetailRow label="Duration" value={`${overview.lastSync.durationMs}ms`} />
								<DetailRow
									label="Rate limit"
									value={
										overview.lastSync.rateLimitLimit
											? `${overview.lastSync.rateLimitRemaining}/${overview.lastSync.rateLimitLimit}`
											: "—"
									}
								/>
							</div>
						</>
					) : (
						<p className="muted">No sync data yet.</p>
					)}

					{overview?.recentSyncs?.length ? (
						<ul className="timeline-list">
							{overview.recentSyncs.slice(0, 5).map((run) => (
								<li key={run.id}>
									<StatusBadge status={run.status} />
									<div>
										<strong>{new Date(run.runAt).toLocaleString()}</strong>
										<span>{run.message ?? `${run.repoCount} repositories synced.`}</span>
									</div>
								</li>
							))}
						</ul>
					) : null}
				</section>

				<section className="glass-panel">
					<div className="spread" style={{ marginBottom: "0.8rem" }}>
						<div>
							<p className="eyebrow">Notifications</p>
							<h3>What needs attention</h3>
						</div>
						<Link to="/notifications" className="btn btn-sm">
							Open inbox
						</Link>
					</div>
					{overview?.recentNotifications.length ? (
						<ul className="feed-list">
							{overview.recentNotifications.slice(0, 6).map((item) => (
								<NotificationRow key={item.id} item={item} />
							))}
						</ul>
					) : (
						<p className="muted">No recent notifications.</p>
					)}
				</section>
			</div>

			<section className="glass-panel">
				<div className="spread" style={{ marginBottom: "0.8rem" }}>
					<div>
						<p className="eyebrow">Audit trail</p>
						<h3>Important admin changes</h3>
					</div>
					<Link to="/admin/users" className="btn btn-sm">
						Manage users
					</Link>
				</div>
				{overview?.recentAudit.length ? (
					<ul className="feed-list audit-list">
						{overview.recentAudit.map((entry) => (
							<AuditRow key={entry.id} entry={entry} />
						))}
					</ul>
				) : (
					<p className="muted">No audit events recorded yet.</p>
				)}
			</section>
		</div>
	);
}

function DashboardStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="stat-card">
			<strong>{value}</strong>
			<span>{label}</span>
		</div>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="metric-inline metric-inline-wide">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function AuditRow({ entry }: { entry: AuditEntry }) {
	return (
		<li>
			<div className="feed-item-head">
				<strong>{entry.summary}</strong>
				<span>{new Date(entry.createdAt).toLocaleString()}</span>
			</div>
			<span className="muted">{entry.actorEmail ?? entry.actorName ?? "System"}</span>
		</li>
	);
}

function NotificationRow({ item }: { item: NotificationItem }) {
	return (
		<li>
			<div className="feed-item-head">
				<strong>{item.title}</strong>
				<span>{new Date(item.createdAt).toLocaleString()}</span>
			</div>
			<span className="muted">{item.message}</span>
		</li>
	);
}

function StatusBadge({ status }: { status: string }) {
	const cls =
		status === "ok"
			? "badge badge-success"
			: status === "error"
				? "badge badge-danger"
				: status === "running"
					? "badge badge-accent"
					: "badge";
	return <span className={cls}>{status}</span>;
}
