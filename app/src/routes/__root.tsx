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
