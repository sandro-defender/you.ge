import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { ClientRuntime } from "../components/ClientRuntime";
import { Nav } from "../components/Nav";
import { NotFound } from "../components/NotFound";
import appStyles from "../styles/app.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "you.ge" },
			{
				name: "description",
				content:
					"Premium developer portfolio for Sandro — product-minded engineering, curated GitHub work, and a private client showcase.",
			},
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "color-scheme", content: "dark" },
			{ name: "theme-color", content: "#0a0914" },
			{ property: "og:site_name", content: "you.ge" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: "you.ge" },
			{
				property: "og:description",
				content:
					"Premium developer portfolio for Sandro — product-minded engineering, curated GitHub work, and a private client showcase.",
			},
			{ property: "og:url", content: "https://you.ge/" },
			{ property: "og:image", content: "https://you.ge/og-image.jpg" },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{ property: "og:image:alt", content: "you.ge — premium developer portfolio" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:image", content: "https://you.ge/og-image.jpg" },
		],
		links: [
			{ rel: "stylesheet", href: appStyles },
			{ rel: "canonical", href: "https://you.ge/" },
			{ rel: "icon", href: "/favicon.ico", sizes: "any" },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
			{ rel: "icon", type: "image/png", href: "/favicon-32x32.png", sizes: "32x32" },
			{ rel: "icon", type: "image/png", href: "/favicon-16x16.png", sizes: "16x16" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/site.webmanifest" },
			{ rel: "mask-icon", href: "/brand/logo-mark.svg", color: "#8b7bff" },
		],
	}),
	notFoundComponent: NotFound,
	component: RootComponent,
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
				<ClientRuntime />
				<main className="shell" id="content">
					<Outlet />
				</main>
				<footer className="site-footer shell">
					<div>
						<strong>you.ge</strong>
						<p>
							A private-first portfolio powered by TanStack Start, Hono,
							better-auth, Cloudflare Workers, D1, and curated GitHub data.
						</p>
					</div>
					<div className="site-footer-links">
						<a href="https://github.com/sandro-defender" target="_blank" rel="noreferrer noopener">
							GitHub ↗
						</a>
						<a href="https://you.ge" target="_blank" rel="noreferrer noopener">
							Production ↗
						</a>
					</div>
				</footer>
				<Scripts />
			</body>
		</html>
	);
}

function RootError({ reset }: { error: unknown; reset: () => void }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<Nav />
				<main className="shell" style={{ paddingTop: "3rem" }}>
					<div className="glass-panel error-panel" aria-labelledby="err-title">
						<span className="badge badge-danger">500 · Server error</span>
						<h1 id="err-title">Something went wrong</h1>
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
