import { Link } from "@tanstack/react-router";

/**
 * Branded 404 body.
 *
 * Rendered by the root route's `notFoundComponent` (see `__root.tsx`). The
 * `$` splat route (`src/routes/$.tsx`) throws `notFound()` so the router —
 * not just the component — treats the request as Not Found and the SSR
 * response carries HTTP 404. Without that throw, every unknown path was a
 * "soft 404": the branded page rendered behind a **200**, which search
 * engines index as real content.
 *
 * SECURITY: this renders for unauthenticated visitors too (the router runs
 * before/after the Worker gate for non-gated paths), so it must never hint
 * at what exists behind the gate — hence "does not exist, or it is gated",
 * with no enumeration.
 */
export function NotFound() {
	return (
		<div className="center-screen">
			<div>
				<p className="badge" style={{ marginBottom: "1rem" }}>
					404
				</p>
				<h1>Nothing here</h1>
				<p className="muted">
					That path does not exist, or it is gated and you are not signed in.
				</p>
				<div className="row" style={{ justifyContent: "center" }}>
					<Link to="/" className="btn btn-primary">
						Back home
					</Link>
					<Link to="/login" className="btn">
						Sign in
					</Link>
				</div>
			</div>
		</div>
	);
}
