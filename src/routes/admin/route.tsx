import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { getServerSession, type SessionUser } from "../../lib/session-fn";
import { safeLoader } from "../../lib/safe-loader";

export const Route = createFileRoute("/admin")({
	head: () => ({ meta: [{ title: "Admin — you.ge" }] }),
	loader: safeLoader(async () => ({ session: await getServerSession() })),
	component: AdminLayout,
});

function AdminLayout() {
	const { session } = Route.useLoaderData() as { session: SessionUser | null };

	return (
		<div className="page-stack">
			<section className="page-header">
				<p className="eyebrow">Admin dashboard</p>
				<h1>Operate the portfolio without touching raw tables</h1>
				<p className="muted page-subtitle">
					Signed in as {session?.email ?? "administrator"}. Sync GitHub, curate
					projects, manage users, and review audit events from one place.
				</p>
			</section>

			<div className="tabs-row" role="tablist" aria-label="Admin sections">
				<Link to="/admin" className="tab-link" activeProps={{ "data-status": "active" }} activeOptions={{ exact: true }}>
					Overview
				</Link>
				<Link to="/admin/repos" className="tab-link" activeProps={{ "data-status": "active" }}>
					Projects
				</Link>
				<Link to="/admin/users" className="tab-link" activeProps={{ "data-status": "active" }}>
					Users &amp; access
				</Link>
			</div>

			<Outlet />
		</div>
	);
}
