import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
	validateSearch: (search: Record<string, unknown>): { next?: string } => ({
		next: typeof search.next === "string" ? search.next : undefined,
	}),
	component: Login,
});

function Login() {
	const { next } = Route.useSearch();
	const navigate = useNavigate();
	const { user, isPending } = useAuthSession();
	const [error, setError] = useState<string | null>(null);
	const [working, setWorking] = useState(false);

	// Already signed in — nothing to do here.
	if (!isPending && user) {
		return (
			<div className="center-screen">
				<div>
					<h2>You're already signed in</h2>
					<p className="muted">Signed in as {user.email}</p>
					<div className="row" style={{ justifyContent: "center" }}>
						<Link to="/projects" className="btn btn-primary">
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
		// On success better-auth navigates the browser to Google, so there is
		// nothing to render afterwards.
		if (target.startsWith("/") && target !== "/login") {
			void navigate({ to: target });
		}
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

