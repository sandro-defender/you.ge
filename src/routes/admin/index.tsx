import { Link, createFileRoute } from "@tanstack/react-router";
import { useApi } from "../../lib/use-api";
import type { SyncRun } from "../../lib/types";

export const Route = createFileRoute("/admin/")({
	component: AdminHome,
});

function AdminHome() {
	const { data, loading, error } = useApi<{ runs: SyncRun[] }>("/api/admin/sync-log");
	const runs = data?.runs ?? [];
	const latest = runs[0];

	return (
		<div>
			<div className="grid" style={{ marginBottom: "1.5rem" }}>
				<AdminCard
					title="Users & access"
					body="See who has signed in, grant or revoke the admin role, ban a user, and end their active sessions."
					to="/admin/users"
					cta="Manage users"
				/>
				<AdminCard
					title="Projects"
					body="Feature or hide repositories, reorder them, and override the description shown on the projects page."
					to="/admin/repos"
					cta="Manage projects"
				/>
			</div>

			<div className="card">
				<h2 style={{ fontSize: "1.15rem" }}>GitHub sync</h2>
				<p className="muted" style={{ fontSize: "0.92rem" }}>
					Runs automatically every 6 hours via a Workers cron trigger. Scheduled
					invocations are free and do not count against the 100k requests/day
					allowance.
				</p>

				{loading ? (
					<p className="dim">
						<span className="spinner" style={{ display: "inline-block", verticalAlign: "middle" }} />{" "}
						Loading sync history…
					</p>
				) : error ? (
					<div className="notice notice-danger" style={{ marginTop: "0.75rem" }}>
						{error}
					</div>
				) : latest ? (
					<div className="row" style={{ marginTop: "0.75rem" }}>
						<StatusBadge status={latest.status} />
						<span className="dim">
							{formatDate(latest.runAt)} · {latest.repoCount} repos ·{" "}
							{latest.durationMs}ms
						</span>
					</div>
				) : (
					<p className="dim" style={{ marginTop: "0.75rem" }}>
						No syncs recorded yet. The cron has not fired, or the database was
						just created.
					</p>
				)}

				{latest?.message ? (
					<p className="dim" style={{ margin: "0.5rem 0 0" }}>
						{latest.message}
					</p>
				) : null}
			</div>
		</div>
	);
}

function AdminCard({
	title,
	body,
	to,
	cta,
}: {
	title: string;
	body: string;
	to: string;
	cta: string;
}) {
	return (
		<div className="card">
			<h2 style={{ fontSize: "1.15rem" }}>{title}</h2>
			<p className="muted" style={{ fontSize: "0.92rem" }}>
				{body}
			</p>
			<Link to={to} className="btn btn-sm">
				{cta} →
			</Link>
		</div>
	);
}

function StatusBadge({ status }: { status: string }) {
	const cls =
		status === "ok"
			? "badge badge-success"
			: status === "error"
				? "badge badge-danger"
				: "badge";
	return <span className={cls}>{status}</span>;
}

function formatDate(value: number | Date): string {
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "unknown";
	return d.toLocaleString();
}
