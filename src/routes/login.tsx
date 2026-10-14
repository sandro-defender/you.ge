import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { signIn, useAuthSession } from "../lib/auth-client";
// Open-redirect guard for `?next=` — a dependency-free leaf so
// scripts/next-guard-test.mjs can unit-test it (see lib/next.ts).
import { sanitiseNext } from "../lib/next";

/**
 * Sign-in page.
 *
 * `?next=` is set by src/server.ts when it redirects an unauthenticated visitor
 * away from a gated path, so signing in returns them to where they were going
 * instead of dumping everyone on the homepage.
 */
export const Route = createFileRoute("/login")({
	// robots stays the root's fail-closed noindex (login pages are not worth
	// indexing); the og defaults also inherit from the root.
	head: () => ({ meta: [{ title: "Sign in — you.ge" }] }),
	validateSearch: (search: Record<string, unknown>): { next?: string } => ({
		next: typeof search.next === "string" ? search.next : undefined,
	}),
	component: Login,
});

function Login() {
	const { next } = Route.useSearch();
	const { user, isPending } = useAuthSession();
	const [error, setError] = useState<string | null>(null);
	const [working, setWorking] = useState(false);

	// Already signed in — nothing to do here.
	if (!isPending && user) {
		return (
			<div className="center-screen">
				<div>
					<h1 style={{ fontSize: "1.75rem" }}>You're already signed in</h1>
					<p className="muted">Signed in as {user.email}</p>
					<div className="row" style={{ justifyContent: "center" }}>
						{/* Full document load: /projects is gated, and only the Worker
						    entry can answer 302/403 — a client-side hop would render
						    the page shell without that check. */}
						<Link to="/projects" reloadDocument className="btn btn-primary">
							Go to projects
						</Link>
						<Link to="/" className="btn">
							Home
						</Link>
					</div>
				</div>
			</div>
		);
	}

	async function onGoogle() {
		setWorking(true);
		setError(null);

		// Only ever redirect to a same-origin relative path. Trusting `next`
		// blindly would make this an open redirect: /login?next=https://evil.tld
		// would bounce a user somewhere attacker-controlled right after they
		// authenticated, which is exactly how phishing flows work.
		const target = sanitiseNext(next);

		const { error: signInError } = await signIn.social({
			provider: "google",
			callbackURL: target,
		});

		if (signInError) {
			setWorking(false);
			setError(
				signInError.message ??
					"Google sign-in failed. Check that the redirect URI is registered in Google Cloud Console.",
			);
			return;
		}
		// On success better-auth's redirect plugin has already set
		// window.location.href to Google, so there is nothing left to do: keep
		// the "Redirecting…" state. (A client-side navigate() here raced that
		// redirect and briefly rendered the gated target without the gate.)
	}

	return (
		<div className="center-screen">
			<div style={{ maxWidth: "26rem", width: "100%" }}>
				<h1 style={{ fontSize: "1.75rem" }}>Sign in</h1>
				<p className="muted">
					This site uses Google sign-in. An administrator must grant your
					account access before the projects page will open.
				</p>

				{error ? (
					<div className="notice notice-danger" role="alert">
						{error}
					</div>
				) : null}

				<button
					type="button"
					className="btn btn-primary"
					style={{ width: "100%", padding: "0.75rem 1rem" }}
					onClick={() => void onGoogle()}
					disabled={working || isPending}
				>
					{working ? (
						<>
							<span className="spinner" /> Redirecting…
						</>
					) : (
						<>Continue with Google</>
					)}
				</button>

				<p className="dim" style={{ marginTop: "1.5rem" }}>
					<Link to="/">← Back to home</Link>
				</p>
			</div>
		</div>
	);
}

