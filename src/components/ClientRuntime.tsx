import { useEffect, useState } from "react";
import { createControllerChangeHandler, registerAppServiceWorker } from "../lib/pwa";

export function ClientRuntime() {
	// Start "online" on BOTH server and client so hydration matches; the real
	// value is read in the effect below (reading navigator.onLine during the
	// first render made an offline load hydrate differently from the SSR HTML).
	const [online, setOnline] = useState(true);
	const [waiting, setWaiting] = useState<ServiceWorkerRegistration | null>(null);

	useEffect(() => {
		setOnline(navigator.onLine);
		const onOnline = () => setOnline(true);
		const onOffline = () => setOnline(false);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);

		let alive = true;
		void registerAppServiceWorker({
			onUpdateReady(registration) {
				if (alive) setWaiting(registration);
			},
		}).catch(() => {
			/* ignore */
		});

		// Reload only when an update replaces an existing controller — the
		// first install's clients.claim() must not reload a first visit.
		const onControllerChange = createControllerChangeHandler(
			Boolean(navigator.serviceWorker?.controller),
			() => window.location.reload(),
		);
		navigator.serviceWorker?.addEventListener?.("controllerchange", onControllerChange);

		return () => {
			alive = false;
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
			navigator.serviceWorker?.removeEventListener?.("controllerchange", onControllerChange);
		};
	}, []);

	if (online && !waiting) return null;

	return (
		<div className="runtime-banner" role={online ? "status" : "alert"} aria-live="polite">
			{!online ? (
				<>
					<strong>Offline mode</strong>
					<span>
						You're viewing the cached app shell and static assets. Protected
						pages refresh when you reconnect.
					</span>
				</>
			) : null}
			{waiting ? (
				<>
					<strong>Update ready</strong>
					<span>A faster, fresher version of the portfolio is ready.</span>
					<button
						type="button"
						className="btn btn-sm btn-primary"
						onClick={() => waiting.waiting?.postMessage({ type: "SKIP_WAITING" })}
					>
						Reload now
					</button>
				</>
			) : null}
		</div>
	);
}
