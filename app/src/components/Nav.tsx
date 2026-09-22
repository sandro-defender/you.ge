import { Link } from "@tanstack/react-router";
import { useAuthSession } from "../lib/auth-client";

/**
 * Site navigation.
 *
 * Uses `useAuthSession()` rather than the internal-header server function,
 * because the nav renders on PUBLIC routes too — and the Worker entry point only
 * validates (and therefore only forwards) a session on gated paths. On a public
 * page this issues one /api/auth/get-session call, which better-auth answers
 * from its signed cookie cache without touching D1.
 */
export function Nav() {
	const { user, isPending, signOutAndRefresh } = useAuthSession();
	const isAdmin = user?.role === "admin";

	return (
		<header className="nav">
			<div className="nav-inner">
				<Link to="/" className="nav-brand">
					you.ge
				</Link>

				<nav className="nav-links" aria-label="Main">
					<Link to="/" className="nav-link" activeProps={{ "data-status": "active" }}>
						Home
					</Link>

					{/*
					  Rendered only when signed in. This is NOT the access control —
					  it is cosmetic. The real gate is in src/server.ts, which
					  refuses to render /projects at all without a valid session.
					  Hiding a link can never be a security boundary, because the
					  route is reachable by typing the URL.
					*/}
					{user ? (
						<Link
							to="/projects"
							className="nav-link"
							activeProps={{ "data-status": "active" }}
						>
							Projects
						</Link>
					) : null}

					{isAdmin ? (
						<Link
							to="/admin"
							className="nav-link"
							activeProps={{ "data-status": "active" }}
						>
							Admin
						</Link>
					) : null}
				</nav>

				<div className="nav-spacer" />

				{isPending ? (
					<div className="spinner" aria-label="Loading session" />
				) : user ? (
					<div className="row">
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
						<button
							type="button"
							className="btn btn-sm"
							onClick={() => void signOutAndRefresh()}
						>
							Sign out
						</button>
					</div>
				) : (
					<Link to="/login" className="btn btn-sm">
						Sign in
					</Link>
				)}
			</div>
		</header>
	);
}
