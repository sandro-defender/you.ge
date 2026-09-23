import { Link, createFileRoute } from "@tanstack/react-router";
import { useAuthSession } from "../lib/auth-client";

/**
 * Public landing page.
 *
 * Deliberately NOT prerendered. Prerendering would emit it as a static file
 * served without invoking the Worker — harmless here, but it also means the
 * nav could not reflect sign-in state, and it sets a habit that becomes a
 * security hole the moment someone prerenders a gated route.
 */
export const Route = createFileRoute("/")({
	/**
	 * The ONLY indexable page (R7). `meta` merge dedupes by name/property and
	 * the most-specific route wins (verified against installed
	 * @tanstack/react-router), so these entries override the root's
	 * fail-closed `robots: noindex` and generic og:title/description/url.
	 * og:image/twitter:card inherit from the root.
	 */
	head: () => ({
		meta: [
			{ title: "you.ge — Sandro's web projects" },
			{ name: "robots", content: "index, follow" },
			{
				property: "og:title",
				content: "you.ge — Sandro's web projects",
			},
			{
				property: "og:description",
				content:
					"I build things for the web. This site is a gated index of my GitHub projects — sign in with Google and an administrator grants access.",
			},
			{ property: "og:url", content: "https://you.ge/" },
		],
		links: [{ rel: "canonical", href: "https://you.ge/" }],
	}),
	component: Home,
});

function Home() {
	const { user } = useAuthSession();
	const signedIn = Boolean(user);

	return (
		<div style={{ paddingTop: "clamp(2rem, 8vh, 5rem)" }}>
			<p className="badge badge-accent" style={{ marginBottom: "1.25rem" }}>
				Private portfolio
			</p>

			<h1>
				Hi, I'm <span style={{ color: "var(--accent-hover)" }}>Sandro</span>.
			</h1>

			<p
				className="muted"
				style={{ fontSize: "1.1rem", maxWidth: "58ch", marginBottom: "2rem" }}
			>
				I build things for the web. This site is a gated index of my GitHub
				projects — sign in with Google and an administrator grants access.
			</p>

			<div className="row">
				{signedIn ? (
					<Link to="/projects" className="btn btn-primary">
						View projects →
					</Link>
				) : (
					<Link to="/login" className="btn btn-primary">
						Sign in with Google
					</Link>
				)}
				<a
					className="btn"
					href="https://github.com/sandro-defender"
					target="_blank"
					rel="noreferrer noopener"
				>
					GitHub
				</a>
			</div>

			<div
				className="notice"
				style={{ marginTop: "3rem", maxWidth: "62ch" }}
			>
				<strong>Why is this gated?</strong>
				<p className="muted" style={{ margin: "0.4rem 0 0" }}>
					Access is granted per user from the admin panel. Signing in with
					Google creates an account, but it does not by itself grant access to
					the projects page — an administrator has to approve it.
				</p>
			</div>
		</div>
	);
}
