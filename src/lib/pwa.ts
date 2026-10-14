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

/**
 * `controllerchange` handler: reload once when an UPDATED worker takes over.
 *
 * The very first install fires `controllerchange` too (the worker calls
 * clients.claim()), so `hadController` — whether this page was already
 * controlled when it loaded — tells an accepted update apart from a
 * first-time visitor, whose page must not reload under them.
 */
export function createControllerChangeHandler(hadController: boolean, reload: () => void) {
	let reloading = false;
	return () => {
		if (!hadController || reloading) return;
		reloading = true;
		reload();
	};
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
