import { Link, createFileRoute } from "@tanstack/react-router";

/**
 * Catch-all 404.
 *
 * `$` is TanStack Router's splat route: it matches any path not claimed by a
 * more specific route. wrangler.jsonc sets `not_found_handling: "404-page"`, so
 * unmatched STATIC asset requests are also mapped here rather than returning a
 * bare platform 404.
 */
export const Route = createFileRoute("/$")({
	head: () => ({ meta: [{ title: "Not found — you.ge" }] }),
	component: NotFound,
});

function NotFound() {
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
