import { Link, createFileRoute } from "@tanstack/react-router";
import { Toast, useToast } from "../components/Toast";
import { getServerSession, type SessionUser } from "../lib/session-fn";
import { safeLoader } from "../lib/safe-loader";
import type { NotificationFeed, NotificationItem } from "../lib/types";
import { apiSend, useApi } from "../lib/use-api";

export const Route = createFileRoute("/notifications")({
	head: () => ({ meta: [{ title: "Inbox — you.ge" }] }),
	loader: safeLoader(async () => ({ session: await getServerSession() })),
	component: NotificationsPage,
});

function NotificationsPage() {
	const { session } = Route.useLoaderData() as { session: SessionUser | null };
	const { data, error, loading, refetch } = useApi<NotificationFeed>("/api/me/notifications?limit=50");
	const { toast, show, dismiss } = useToast();
	const items = data?.items ?? [];

	async function markRead(id: number) {
		try {
			await apiSend(`/api/me/notifications/${id}/read`, { method: "POST" });
			show("success", "Notification marked as read.");
			refetch();
		} catch (err) {
			show("error", err instanceof Error ? err.message : "Could not update notification.");
		}
	}

	async function markAllRead() {
		try {
			await apiSend("/api/me/notifications/read-all", { method: "POST" });
			show("success", "Inbox cleared.");
			refetch();
		} catch (err) {
			show("error", err instanceof Error ? err.message : "Could not clear notifications.");
		}
	}

	return (
		<div className="page-stack">
			<section className="page-header spread">
				<div>
					<p className="eyebrow">Notification center</p>
					<h1>Inbox and activity</h1>
					<p className="muted page-subtitle">
						Important updates for {session?.email ?? "your account"}: sync results,
						repository discoveries, admin actions, and access changes.
					</p>
				</div>
				<div className="row">
					<span className="badge badge-accent">{data?.unreadCount ?? 0} unread</span>
					<button type="button" className="btn btn-sm" onClick={() => void markAllRead()} disabled={!data?.unreadCount}>
						Mark all read
					</button>
				</div>
			</section>

			{error ? (
				<div className="glass-panel notice notice-danger" role="alert">
					{error}
				</div>
			) : null}

			{loading ? (
				<div className="glass-panel">
					{Array.from({ length: 5 }, (_, index) => (
						<div key={index} className="skeleton" style={{ height: "1.2rem", marginTop: index ? "0.8rem" : 0 }} />
					))}
				</div>
			) : null}

			{!loading && items.length === 0 ? (
				<div className="glass-panel empty-state">
					<strong>Inbox zero.</strong>
					<p className="muted">When syncs, access changes, or admin actions happen, they’ll show up here.</p>
				</div>
			) : null}

			{items.length > 0 ? (
				<ul className="notification-list">
					{items.map((item) => (
						<NotificationCard key={item.id} item={item} onMarkRead={markRead} />
					))}
				</ul>
			) : null}
			<Toast toast={toast} dismiss={dismiss} />
		</div>
	);
}

function NotificationCard({
	item,
	onMarkRead,
}: {
	item: NotificationItem;
	onMarkRead: (id: number) => void;
}) {
	return (
		<li className={`glass-panel notification-card ${item.readAt ? "is-read" : ""}`}>
			<div className="spread" style={{ alignItems: "flex-start" }}>
				<div>
					<div className="row row-tight">
						<span className={`badge ${levelClass(item.level)}`}>{item.level}</span>
						{item.readAt ? <span className="badge">Read</span> : <span className="badge badge-accent">Unread</span>}
					</div>
					<h3 style={{ marginTop: "0.8rem" }}>{item.title}</h3>
					<p className="muted">{item.message}</p>
					<p className="dim">{new Date(item.createdAt).toLocaleString()}</p>
				</div>
				<div className="row row-tight">
					{item.link ? (
						<Link to={item.link} className="btn btn-sm">
							Open
						</Link>
					) : null}
					{!item.readAt ? (
						<button type="button" className="btn btn-sm" onClick={() => onMarkRead(item.id)}>
							Mark read
						</button>
					) : null}
				</div>
			</div>
		</li>
	);
}

function levelClass(level: NotificationItem["level"]) {
	if (level === "error") return "badge-danger";
	if (level === "warning") return "badge-warning";
	if (level === "success") return "badge-success";
	return "badge-accent";
}
