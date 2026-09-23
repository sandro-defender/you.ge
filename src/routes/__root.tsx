import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Nav } from "../components/Nav";
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
			// The site is gated, so there is nothing to index. Telling crawlers
			// not to index avoids a search result that leads to a login wall.
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "color-scheme", content: "dark" },
			{ name: "theme-color", content: "#0a0a0f" },
		],
		links: [{ rel: "stylesheet", href: appStyles }],
	}),
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
