type RegisterOptions = {
	onUpdateReady?: (registration: ServiceWorkerRegistration) => void;
	onRegistered?: (registration: ServiceWorkerRegistration) => void;
};

export function shouldRegisterServiceWorker(locationLike = globalThis.location) {
	if (typeof navigator === "undefined") return false;
	if (!("serviceWorker" in navigator)) return false;
	if (!locationLike) return false;
	return locationLike.protocol === "https:" || locationLike.hostname === "localhost";
}

export async function registerAppServiceWorker(options: RegisterOptions = {}) {
	if (!shouldRegisterServiceWorker()) return null;
	const registration = await navigator.serviceWorker.register("/service-worker.js");
	options.onRegistered?.(registration);
	watchRegistration(registration, options.onUpdateReady);
	return registration;
}

function watchRegistration(
	registration: ServiceWorkerRegistration,
	onUpdateReady?: (registration: ServiceWorkerRegistration) => void,
) {
	if (registration.waiting) onUpdateReady?.(registration);
	registration.addEventListener("updatefound", () => {
		const installing = registration.installing;
		if (!installing) return;
		installing.addEventListener("statechange", () => {
			if (installing.state === "installed" && navigator.serviceWorker.controller) {
				onUpdateReady?.(registration);
			}
		});
	});
}
