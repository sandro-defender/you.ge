import { Outlet, createRootRoute } from "@tanstack/react-router";
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
		<>
			<Nav />
			<main className="shell">
				<Outlet />
			</main>
		</>
	);
}
