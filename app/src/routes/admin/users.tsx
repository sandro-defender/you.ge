import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "../../lib/auth-client";

/**
 * Users & access — the page that satisfies "admin panel where I can grant
 * access to users".
 *
 * ── WHY THIS USES authClient.admin.* AND NOT A CUSTOM HONO ENDPOINT ─────────
 * better-auth's admin plugin already exposes list-users, set-role, ban-user,
 * unban-user and revoke-user-sessions at /api/auth/admin/*, with its own
 * authorization checks and audit-friendly semantics. Reimplementing them in
 * Hono would mean hand-rolling exactly what the plugin gives for free — and
 * getting the role check subtly wrong, which is the classic way an admin panel
 * ends up privately escalating privileges.
 *
 * ── THE DUAL-AUTHORIZATION GOTCHA ──────────────────────────────────────────
 * These endpoints enforce `user.role === "admin"` IN THE DATABASE, separately
 * from the guard in src/server.ts. If your role is only set via an env allowlist
 * and not in the `user` table, every button below returns 403 while the page
 * itself loads fine. Fix: `npm run auth:create-admin`.
 */
export const Route = createFileRoute("/admin/users")({
	head: () => ({ meta: [{ title: "Users & access — you.ge" }] }),
	component: AdminUsers,
});

type UserRow = {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	createdAt?: string | Date | number | null;
};

function AdminUsers() {
	const [users, setUsers] = useState<UserRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);

		const { data, error: listError } = await authClient.admin.listUsers({
			query: { limit: 200, sortBy: "createdAt", sortDirection: "desc" },
		});

		if (listError) {
			setError(
				listError.message ??
					"Could not list users. Confirm your account has role='admin' in the database.",
			);
			setUsers(null);
		} else {
			// The plugin returns an array of users; tolerate a wrapped shape.
			const rows = Array.isArray(data) ? data : ((data as never as { users?: UserRow[] })?.users ?? []);
			setUsers(rows as UserRow[]);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	/** Run a mutation, then reload so the table reflects server truth. */
	async function run(userId: string, action: () => Promise<{ error: { message?: string } | null }>) {
		setBusyId(userId);
		setError(null);
		const { error: actionError } = await action();
		if (actionError) {
			setError(actionError.message ?? "Action failed.");
		} else {
			await load();
		}
		setBusyId(null);
	}

	const visible = (users ?? []).filter((u) => {
		if (!search.trim()) return true;
		const needle = search.toLowerCase();
		return (
			u.email.toLowerCase().includes(needle) ||
			(u.name ?? "").toLowerCase().includes(needle)
		);
	});

	return (
		<div>
			<div className="spread" style={{ marginBottom: "1rem" }}>
				<h2 style={{ margin: 0 }}>Users &amp; access</h2>
				<div className="row">
					<input
						className="input"
						style={{ width: "15rem" }}
						type="search"
						placeholder="Filter by name or email…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					<button
						type="button"
						className="btn btn-sm"
						onClick={() => void load()}
						disabled={loading}
					>
						{loading ? <span className="spinner" /> : "Refresh"}
					</button>
				</div>
			</div>

			<div className="notice" style={{ marginBottom: "1rem" }}>
				<p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
					<strong>How access works:</strong> anyone can sign in with Google, which
					creates an account with role <code>user</code>. Only an{" "}
					<code>admin</code> can open <code>/admin</code>. The{" "}
					<code>/projects</code> page currently requires a session and an unbanned
					account — edit <code>ACCESS_POLICY</code> in <code>src/server.ts</code>{" "}
					to require a specific role instead.
				</p>
			</div>

			{error ? (
				<div className="notice notice-danger" role="alert">
					{error}
				</div>
			) : null}

			{loading && users === null ? (
				<p className="dim">
					<span
						className="spinner"
						style={{ display: "inline-block", verticalAlign: "middle" }}
					/>{" "}
					Loading users…
				</p>
			) : null}

			{users !== null ? (
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>User</th>
								<th>Role</th>
								<th>Status</th>
								<th>Joined</th>
								<th style={{ textAlign: "right" }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{visible.length === 0 ? (
								<tr>
									<td colSpan={5} className="dim">
										No users match that filter.
									</td>
								</tr>
							) : (
								visible.map((user) => (
									<UserRowView
										key={user.id}
										user={user}
										busy={busyId === user.id}
										onSetRole={(role) =>
											void run(user.id, () =>
												authClient.admin.setRole({ userId: user.id, role }),
											)
										}
										onBan={() =>
											void run(user.id, () =>
												authClient.admin.banUser({
													userId: user.id,
													banReason: "Access revoked by an administrator.",
												}),
											)
										}
										onUnban={() =>
											void run(user.id, () =>
												authClient.admin.unbanUser({ userId: user.id }),
											)
										}
										onRevokeSessions={() =>
											void run(user.id, () =>
												authClient.admin.revokeUserSessions({ userId: user.id }),
											)
										}
									/>
								))
							)}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	);
}

function UserRowView({
	user,
	busy,
	onSetRole,
	onBan,
	onUnban,
	onRevokeSessions,
}: {
	user: UserRow;
	busy: boolean;
	onSetRole: (role: "admin" | "user") => void;
	onBan: () => void;
	onUnban: () => void;
	onRevokeSessions: () => void;
}) {
	const role = user.role ?? "user";

	return (
		<tr>
			<td>
				<div className="row" style={{ flexWrap: "nowrap" }}>
					{user.image ? (
						<img
							className="avatar"
							src={user.image}
							alt=""
							width={30}
							height={30}
							referrerPolicy="no-referrer"
						/>
					) : (
						<span className="avatar avatar-fallback" aria-hidden="true">
							{(user.name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
						</span>
					)}
					<div style={{ minWidth: 0 }}>
						<div style={{ fontWeight: 550 }}>{user.name}</div>
						<div className="dim" style={{ overflowWrap: "anywhere" }}>
							{user.email}
						</div>
					</div>
				</div>
			</td>

			<td>
				<select
					className="select"
					style={{ width: "auto", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
					value={role}
					disabled={busy}
					onChange={(e) => {
						const next = e.target.value;
						if (next === "admin" || next === "user") onSetRole(next);
					}}
				>
					<option value="user">user</option>
					<option value="admin">admin</option>
				</select>
			</td>

			<td>
				{user.banned ? (
					<span className="badge badge-danger" title={user.banReason ?? undefined}>
						banned
					</span>
				) : (
					<span className="badge badge-success">active</span>
				)}
			</td>

			<td className="dim">{formatJoined(user.createdAt)}</td>

			<td>
				<div className="row" style={{ justifyContent: "flex-end" }}>
					{busy ? <span className="spinner" /> : null}
					{user.banned ? (
						<button type="button" className="btn btn-sm" onClick={onUnban} disabled={busy}>
							Unban
						</button>
					) : (
						<button
							type="button"
							className="btn btn-sm btn-danger"
							onClick={onBan}
							disabled={busy}
						>
							Ban
						</button>
					)}
					<button
						type="button"
						className="btn btn-sm"
						onClick={onRevokeSessions}
						disabled={busy}
						title="End every active session for this user"
					>
						Revoke sessions
					</button>
				</div>
			</td>
		</tr>
	);
}

function formatJoined(value: string | Date | number | null | undefined): string {
	if (value === null || value === undefined) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString();
}
