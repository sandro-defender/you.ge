import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toast, useToast } from "../../components/Toast";
import type { AdminUser } from "../../lib/types";
import { apiSend, useApi } from "../../lib/use-api";

export const Route = createFileRoute("/admin/users")({
	head: () => ({ meta: [{ title: "Users & access — you.ge" }] }),
	component: AdminUsers,
});

function AdminUsers() {
	const { data, error, loading, refetch } = useApi<{ users: AdminUser[] }>("/api/admin/users");
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState<"all" | "user" | "member" | "admin">("all");
	const [busyId, setBusyId] = useState<string | null>(null);
	const { toast, show, dismiss } = useToast();
	const users = data?.users ?? [];

	const visible = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return users.filter((user) => {
			if (roleFilter !== "all" && (user.role ?? "user") !== roleFilter) return false;
			if (!needle) return true;
			return `${user.name} ${user.email}`.toLowerCase().includes(needle);
		});
	}, [users, search, roleFilter]);

	async function mutate(userId: string, body: { role?: "user" | "member" | "admin"; banned?: boolean; banReason?: string | null }) {
		setBusyId(userId);
		try {
			await apiSend(`/api/admin/users/${userId}`, { method: "PATCH", body });
			show("success", "Access updated.");
			refetch();
		} catch (err) {
			show("error", err instanceof Error ? err.message : "Could not update access.");
		} finally {
			setBusyId(null);
		}
	}

	async function revokeSessions(userId: string) {
		setBusyId(userId);
		try {
			await apiSend(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" });
			show("success", "All active sessions revoked.");
			refetch();
		} catch (err) {
			show("error", err instanceof Error ? err.message : "Could not revoke sessions.");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="page-stack">
			<div className="glass-panel filter-panel">
				<div className="filter-grid">
					<label className="field-label">
						<span>Search</span>
						<input
							className="input"
							type="search"
							placeholder="Search by name or email…"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</label>
					<label className="field-label">
						<span>Role</span>
						<select
							className="select"
							value={roleFilter}
							onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
						>
							<option value="all">All roles</option>
							<option value="user">user</option>
							<option value="member">member</option>
							<option value="admin">admin</option>
						</select>
					</label>
				</div>
				<div className="spread" style={{ marginTop: "1rem" }}>
					<p className="muted" style={{ margin: 0 }}>
						Signed-in users start as <code>user</code>. Grant <code>member</code>
						 for projects and <code>admin</code> for the dashboard.
					</p>
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

			{loading && users.length === 0 ? (
				<div className="project-grid">
					{Array.from({ length: 4 }, (_, index) => (
						<div key={index} className="glass-panel">
							<div className="skeleton" style={{ height: "1.25rem", width: "48%" }} />
							<div className="skeleton" style={{ height: "1rem", marginTop: "0.7rem" }} />
							<div className="skeleton" style={{ height: "1rem", marginTop: "0.5rem", width: "65%" }} />
						</div>
					))}
				</div>
			) : null}

			{!loading && visible.length === 0 ? (
				<div className="glass-panel empty-state">
					<strong>No users match that filter.</strong>
					<p className="muted">Try adjusting the search query or role filter.</p>
				</div>
			) : null}

			<div className="user-grid">
				{visible.map((user) => (
					<div key={user.id} className="glass-panel user-card">
						<div className="spread" style={{ alignItems: "flex-start" }}>
							<div className="row row-tight" style={{ alignItems: "flex-start" }}>
								{user.image ? (
									<img className="avatar" src={user.image} alt="" width={36} height={36} referrerPolicy="no-referrer" />
								) : (
									<span className="avatar avatar-fallback" aria-hidden="true">
										{user.name?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase() ?? "?"}
									</span>
								)}
								<div>
									<h3 style={{ marginBottom: "0.2rem" }}>{user.name || "Unnamed user"}</h3>
									<p className="muted" style={{ margin: 0 }}>{user.email}</p>
								</div>
							</div>
							<span className={user.banned ? "badge badge-danger" : "badge badge-success"}>
								{user.banned ? "Suspended" : "Active"}
							</span>
						</div>

						<div className="field-grid two-up">
							<label className="field-label">
								<span>Role</span>
								<select
									className="select"
									value={user.role ?? "user"}
									disabled={busyId === user.id}
									onChange={(event) =>
										void mutate(user.id, { role: event.target.value as "user" | "member" | "admin" })
									}
								>
									<option value="user">user</option>
									<option value="member">member</option>
									<option value="admin">admin</option>
								</select>
							</label>
							<div className="field-label">
								<span>Status</span>
								<div className="row row-tight">
									<button
										type="button"
										className="btn btn-sm"
										onClick={() => void mutate(user.id, { banned: !user.banned })}
										disabled={busyId === user.id}
									>
										{user.banned ? "Restore" : "Suspend"}
									</button>
									<button
										type="button"
										className="btn btn-sm"
										onClick={() => void revokeSessions(user.id)}
										disabled={busyId === user.id}
									>
										Revoke sessions
									</button>
								</div>
							</div>
						</div>

						<div className="metrics-stack compact-metrics">
							<UserDetail label="Joined" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"} />
							<UserDetail label="Last sign-in" value={user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"} />
							<UserDetail label="Active sessions" value={String(user.activeSessions)} />
						</div>

						{user.recentAccess.length ? (
							<div className="user-access-log">
								<strong>Recent access</strong>
								<ul>
									{user.recentAccess.map((entry) => (
										<li key={entry}>{entry}</li>
									))}
								</ul>
							</div>
						) : null}

						{busyId === user.id ? <div className="spinner user-card-spinner" aria-hidden="true" /> : null}
					</div>
				))}
			</div>
			<Toast toast={toast} dismiss={dismiss} />
		</div>
	);
}

function UserDetail({ label, value }: { label: string; value: string }) {
	return (
		<div className="metric-inline metric-inline-wide">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}
