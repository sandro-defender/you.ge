import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Nav } from "../components/Nav";
import { NotFound } from "../components/NotFound";
import appStyles from "../styles/app.css?url";

/**
 * Root route.
 *
 * `?url` on the CSS import makes Vite emit a hashed stylesheet and hand back
 * its URL, which we then register as a <link> through the route's `head()`.
 * That is the idiomatic Start way to get CSS into SSR output — importing the
 * stylesheet for its side effects instead would leave the server render
 * unstyled until hydration.
 *
 * ── THE DOCUMENT SHELL IS LOAD-BEARING (verified against installed packages) ──
 * This component MUST render the full document — `<html><head><HeadContent />
 * </head><body>…<Scripts /></body></html>` — not just a fragment:
 *
 *   1. `head()` entries (title, meta, the CSS <link> above) are only emitted
 *      where `<HeadContent />` renders. Without it the browser never receives
 *      the stylesheet, title, viewport or robots tags: a fragment-only root
 *      ships an unstyled page with no <head> at all.
 *   2. `<Scripts />` (server side) calls `takeInitialHydrationScriptTags()`,
 *      which is what places the router bootstrap scripts in the body and marks
 *      the stream boundary the SSR transform waits on before emitting
 *      `</body></html>`.
 *   3. React 19's server renderer only prepends `<!DOCTYPE html>` when the
 *      root element is `<html>` (the preamble path in react-dom's
 *      `doctypeChunk` handling). A fragment root produces a doctype-less
 *      response and the browser drops into quirks mode.
 *
 * The canonical shape matches the skill docs shipped inside the installed
 * `@tanstack/react-start` package (`skills/react-start/SKILL.md`).
 */
export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "you.ge" },
			{
				name: "description",
				content: "Projects and writing by sandro-defender. Access by invitation.",
			},
			// FAIL-CLOSED DEFAULT (R7): every route is noindex unless the route
			// itself overrides with index,follow — the meta merge dedupes by
			// name and the most-specific route wins (verified against the
			// installed @tanstack/react-router headContentUtils). Only `/`
			// overrides. A future route that forgets its robots meta is hidden
			// from crawlers by default — for a gated site that is the right
			// failure mode. Anything that never renders meta (gate pages, the
			// Worker error page) carries noindex inline.
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "color-scheme", content: "dark" },
			{ name: "theme-color", content: "#0a0a0f" },
			// ── Open Graph / Twitter share-card defaults (R7) ────────────────────
			// Generic card for every route. `/` refines og:title/description/url;
			// gated routes deliberately keep the generic card so NO project or
			// user data can leak into a share preview (and anonymous scrapers
			// only ever see the 302 anyway). twitter:title/description are
			// intentionally NOT set: Twitter falls back to the og: values, so
			// the override chain stays single-sourced.
			{ property: "og:site_name", content: "you.ge" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: "you.ge" },
			{
				property: "og:description",
				content:
					"Projects and writing by sandro-defender. Access by invitation.",
			},
			{ property: "og:url", content: "https://you.ge/" },
			{ property: "og:image", content: "https://you.ge/og.jpg" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content: "you.ge — Sandro's web projects",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:image", content: "https://you.ge/og.jpg" },
		],
		links: [{ rel: "stylesheet", href: appStyles }],
	}),
	/**
	 * Real 404s: the `$` splat throws `notFound()` (see `src/routes/$.tsx`)
	 * and this component renders with a proper HTTP 404 status.
	 */
	notFoundComponent: NotFound,
	component: RootComponent,
	/**
	 * Error boundary for route-level failures (loader/render throws), on the
	 * server AND after hydration. SECURITY: never render `error.message` or a
	 * stack — SSR exceptions can carry file paths, SQL fragments or env values,
	 * and this page is world-readable. The server logs the details; the user
	 * gets an apology and a way out. Anything that escapes even this lands in
	 * the Worker entry's try/catch → serverErrorPage() (src/server/gate-page).
	 */
	errorComponent: RootError,
});

function RootComponent() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<Nav />
				<main className="shell">
					<Outlet />
				</main>
				<Scripts />
			</body>
		</html>
	);
}

/**
 * Branded, information-free error state. Mirrors the Worker-level
 * serverErrorPage(): same copy tone, no stack, no error.message. `reset`
 * re-mounts the route tree (client-side retry).
 */
function RootError({ reset }: { error: unknown; reset: () => void }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<Nav />
				<main className="shell" style={{ paddingTop: "3rem" }}>
					<div className="card" style={{ maxWidth: "36rem" }} aria-labelledby="err-title">
						<span className="badge badge-danger">500 · Server error</span>
						<h1 id="err-title" style={{ fontSize: "1.5rem" }}>
							Something went wrong
						</h1>
						<p className="muted">
							An unexpected error occurred while rendering this page. It has
							been logged — try again in a moment.
						</p>
						<div className="row">
							<button type="button" className="btn btn-primary" onClick={() => reset()}>
								Try again
							</button>
							<a className="btn" href="/">
								Back to home
							</a>
						</div>
					</div>
				</main>
				<Scripts />
			</body>
		</html>
	);
}
