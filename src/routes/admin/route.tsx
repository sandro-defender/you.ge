import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { getServerSession, type SessionUser } from "../../lib/session-fn";
import { safeLoader } from "../../lib/safe-loader";

/**
 * Admin layout.
 *
 * Like /projects, the real gate is src/server.ts: it checks
 * `session.user.role === "admin"` and returns 403 before rendering. What is
 * here is layout, navigation, and confirming the session for display.
 */
export const Route = createFileRoute("/admin")({
	head: () => ({
		meta: [{ title: "Admin — you.ge" }],
	}),
	loader: safeLoader(async () => ({
		session: await getServerSession(),
	})),
	component: AdminLayout,
});

function AdminLayout() {
	const { session } = Route.useLoaderData() as { session: SessionUser | null };

	return (
		<div style={{ paddingTop: "2rem" }}>
			<div className="spread" style={{ marginBottom: "1.5rem" }}>
				<div>
					<h1>Admin</h1>
					<p className="muted" style={{ margin: 0 }}>
						{session ? `Signed in as ${session.email}` : "Administrator"}
					</p>
				</div>
			</div>

			<div className="row" style={{ marginBottom: "1.75rem", gap: "0.4rem" }}>
				<Link to="/admin" className="btn btn-sm" activeOptions={{ exact: true }}>
					Overview
				</Link>
				<Link to="/admin/users" className="btn btn-sm">
					Users &amp; access
				</Link>
				<Link to="/admin/repos" className="btn btn-sm">
					Projects
				</Link>
			</div>

			<Outlet />
		</div>
	);
}
