import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getServerSession, type SessionUser } from "../lib/session-fn";
import { safeLoader } from "../lib/safe-loader";

const BROWSER_ALERT_PREF = "youge:browser-alerts-enabled";

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Settings — you.ge" }] }),
	loader: safeLoader(async () => ({ session: await getServerSession() })),
	component: SettingsPage,
});

function SettingsPage() {
	const { session } = Route.useLoaderData() as { session: SessionUser | null };
	const [permission, setPermission] = useState<NotificationPermission>("default");
	const [prefEnabled, setPrefEnabled] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		setPermission(window.Notification?.permission ?? "default");
		setPrefEnabled(window.localStorage.getItem(BROWSER_ALERT_PREF) === "true");
	}, []);

	async function enableBrowserAlerts() {
		if (typeof window === "undefined" || !("Notification" in window)) {
			setMessage("Browser notifications are not supported in this browser.");
			return;
		}
		const next = await window.Notification.requestPermission();
		setPermission(next);
		const enabled = next === "granted";
		window.localStorage.setItem(BROWSER_ALERT_PREF, enabled ? "true" : "false");
		setPrefEnabled(enabled);
		setMessage(
			enabled
				? "Browser alerts enabled. you.ge will only ever ask when you choose to enable them here."
				: "Permission not granted. You can continue using the in-app inbox without browser alerts.",
		);
	}

	return (
		<div className="page-stack">
			<section className="page-header">
				<p className="eyebrow">Settings</p>
				<h1>Personal preferences</h1>
				<p className="muted page-subtitle">
					Signed in as {session?.email ?? "your account"}. Manage optional browser
					alerts and understand how the portfolio behaves offline.
				</p>
			</section>

			<div className="grid-two">
				<section className="glass-panel">
					<p className="eyebrow">Browser alerts</p>
					<h2>Opt in, never automatic</h2>
					<p className="muted">
						you.ge will not request browser notification permission unless you
						explicitly enable it here.
					</p>
					<div className="metrics-stack compact-metrics">
						<div className="metric-inline metric-inline-wide">
							<span>Permission</span>
							<strong>{permission}</strong>
						</div>
						<div className="metric-inline metric-inline-wide">
							<span>Local preference</span>
							<strong>{prefEnabled ? "enabled" : "disabled"}</strong>
						</div>
					</div>
					<div className="row" style={{ marginTop: "1rem" }}>
						<button type="button" className="btn btn-primary" onClick={() => void enableBrowserAlerts()}>
							Enable browser alerts
						</button>
					</div>
					{message ? <p className="muted" style={{ marginTop: "1rem" }}>{message}</p> : null}
				</section>

				<section className="glass-panel">
					<p className="eyebrow">Offline and updates</p>
					<h2>PWA behavior</h2>
					<ul className="feature-list">
						<li>Only the app shell and static assets are cached for offline use.</li>
						<li>Protected pages and APIs stay network-first for security.</li>
						<li>When a new deployment is ready, you’ll see an update banner.</li>
						<li>The in-app inbox continues to work as the primary notification surface.</li>
					</ul>
				</section>
			</div>
		</div>
	);
}
