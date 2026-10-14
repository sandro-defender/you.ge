import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useAuthSession } from "../lib/auth-client";
import { trackEvent } from "../lib/analytics";
import { ADMIN_ROLES, hasRole } from "../lib/roles";
import type { NotificationFeed } from "../lib/types";

export function Nav() {
	const location = useLocation();
	const { user, isPending, signOutAndRefresh } = useAuthSession();
	const [menuOpen, setMenuOpen] = useState(false);
	const [unread, setUnread] = useState(0);
	const toggleRef = useRef<HTMLButtonElement>(null);
	// Roles may be comma-separated ("admin,member") — never compare with ===.
	const isAdmin = hasRole(user?.role, ADMIN_ROLES);
	const userId = user?.id;

	useEffect(() => {
		setMenuOpen(false);
	}, [location.pathname]);

	// Escape closes the mobile menu and hands focus back to its toggle.
	useEffect(() => {
		if (!menuOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setMenuOpen(false);
			toggleRef.current?.focus();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [menuOpen]);

	useEffect(() => {
		if (!userId) {
			setUnread(0);
			return;
		}
		let ignore = false;
		const load = async () => {
			// Background tabs do not poll: every request counts against the
			// Workers Free daily budget (README: polling is a quota hazard).
			if (document.visibilityState === "hidden") return;
			try {
				const res = await fetch("/api/me/notifications?limit=1", {
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
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") void load();
		};
		void load();
		const timer = window.setInterval(load, 60_000);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			ignore = true;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [userId]);

	// `gated` links get a full document load so the Worker entry's gate runs
	// (302 to /login, 403 "Access pending", or SSR with the session); a
	// client-side hop rendered the gated page shell without that check.
	const links = useMemo(
		() => [
			{ to: "/", label: "Home", show: true, gated: false },
			{ to: "/projects", label: "Projects", show: Boolean(userId), gated: true },
			{ to: "/notifications", label: "Inbox", show: Boolean(userId), gated: true, badge: unread },
			{ to: "/settings", label: "Settings", show: Boolean(userId), gated: true },
			{ to: "/admin", label: "Admin", show: isAdmin, gated: true },
		],
		[userId, unread, isAdmin],
	);

	return (
		<header className="nav">
			<a className="skip-link" href="#content">
				Skip to content
			</a>
			<div className="nav-inner">
				<Link to="/" className="nav-brand" onClick={() => trackEvent("nav.home")}>
					<img src="/brand/logo-mark.svg" alt="" width={28} height={28} />
					<span>you.ge</span>
				</Link>

				<button
					ref={toggleRef}
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
									reloadDocument={link.gated}
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
							<div className="spinner" role="status" aria-label="Loading session" />
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
										{(user.name || user.email)?.[0]?.toUpperCase() ?? "?"}
									</span>
								)}
								<div className="nav-user-copy">
									<strong>{user.name || "Signed in"}</strong>
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
							<Link to="/login" className="btn btn-sm btn-primary" onClick={() => trackEvent("auth.login-cta")}>
								Sign in
							</Link>
						)}
					</div>
				</div>
			</div>
		</header>
	);
}
