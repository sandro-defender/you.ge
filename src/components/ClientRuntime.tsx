import { useEffect, useState } from "react";
import { registerAppServiceWorker } from "../lib/pwa";

export function ClientRuntime() {
	const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
	const [waiting, setWaiting] = useState<ServiceWorkerRegistration | null>(null);

	useEffect(() => {
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

		const onControllerChange = () => window.location.reload();
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
