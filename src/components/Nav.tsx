import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useAuthSession } from "../lib/auth-client";
import { trackEvent } from "../lib/analytics";
import type { NotificationFeed } from "../lib/types";

export function Nav() {
	const location = useLocation();
	const { user, isPending, signOutAndRefresh } = useAuthSession();
	const [menuOpen, setMenuOpen] = useState(false);
	const [unread, setUnread] = useState(0);
	const isAdmin = user?.role === "admin";

	useEffect(() => {
		setMenuOpen(false);
	}, [location.pathname]);

	useEffect(() => {
		if (!user) {
			setUnread(0);
			return;
		}
		let ignore = false;
		const load = async () => {
			try {
				const res = await fetch("/api/me/notifications?limit=6", {
					credentials: "same-origin",
					headers: { Accept: "application/json" },
				});
				if (!res.ok) return;
				const data = (await res.json()) as NotificationFeed;
				if (!ignore) setUnread(data.unreadCount);
			} catch {
				/* ignore */
			}
		};
		void load();
		const timer = window.setInterval(load, 60_000);
		return () => {
			ignore = true;
			window.clearInterval(timer);
		};
	}, [user?.id]);

	const links = useMemo(
		() => [
			{ to: "/", label: "Home", show: true },
			{ to: "/projects", label: "Projects", show: Boolean(user) },
			{ to: "/notifications", label: "Inbox", show: Boolean(user), badge: unread },
			{ to: "/settings", label: "Settings", show: Boolean(user) },
			{ to: "/admin", label: "Admin", show: isAdmin },
		],
		[user, unread, isAdmin],
	);

	return (
		<header className="nav">
			<a className="skip-link" href="#content">
				Skip to content
			</a>
			<div className="nav-inner">
				<Link to="/" className="nav-brand" onClick={() => trackEvent("nav.home") }>
					<img src="/brand/logo-mark.svg" alt="" width={28} height={28} />
					<span>you.ge</span>
				</Link>

				<button
					type="button"
					className="nav-toggle"
					aria-expanded={menuOpen}
					aria-controls="primary-nav"
					onClick={() => setMenuOpen((value) => !value)}
				>
					<span />
					<span />
					<span />
					<span className="sr-only">Toggle navigation</span>
				</button>

				<div className={`nav-panel ${menuOpen ? "is-open" : ""}`} id="primary-nav">
					<nav className="nav-links" aria-label="Main">
						{links
							.filter((link) => link.show)
							.map((link) => (
								<Link
									key={link.to}
									to={link.to}
									className="nav-link"
									activeProps={{ "data-status": "active" }}
									onClick={() => trackEvent("nav.click", { target: link.to })}
								>
									{link.label}
									{link.badge ? <span className="nav-badge">{link.badge}</span> : null}
								</Link>
							))}
					</nav>

					<div className="nav-actions">
						{isPending ? (
							<div className="spinner" aria-label="Loading session" />
						) : user ? (
							<div className="row row-tight nav-user">
								{user.image ? (
									<img
										className="avatar"
										src={user.image}
										alt=""
										width={32}
										height={32}
										referrerPolicy="no-referrer"
									/>
								) : (
									<span className="avatar avatar-fallback" aria-hidden="true">
										{(user.name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
									</span>
								)}
								<div className="nav-user-copy">
									<strong>{user.name ?? "Signed in"}</strong>
									<span>{user.email}</span>
								</div>
								<button
									type="button"
									className="btn btn-sm"
									onClick={() => {
										trackEvent("auth.signout");
										void signOutAndRefresh();
									}}
								>
									Sign out
								</button>
							</div>
						) : (
							<Link to="/login" className="btn btn-sm btn-primary" onClick={() => trackEvent("auth.login-cta") }>
								Sign in
							</Link>
						)}
					</div>
				</div>
			</div>
		</header>
	);
}
