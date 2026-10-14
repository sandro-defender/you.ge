import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Loads public/service-worker.js into a sandbox with a fake `self`, Cache
// Storage and network, then drives its install / message / fetch handlers.
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(APP_DIR, "public", "service-worker.js"), "utf8");
const ORIGIN = "https://you.ge";

function fakeResponse(status, label) {
	return {
		status,
		ok: status >= 200 && status < 300,
		label,
		clone() {
			return this;
		},
	};
}

function loadWorker({ network }) {
	const listeners = new Map();
	const stores = new Map();
	const calls = { skipWaiting: 0, claim: 0 };
	const cacheFor = (name) => {
		if (!stores.has(name)) stores.set(name, new Map());
		const store = stores.get(name);
		const keyOf = (request) => (typeof request === "string" ? request : new URL(request.url).pathname);
		return {
			addAll: async (urls) => urls.forEach((url) => store.set(url, fakeResponse(200, `precached ${url}`))),
			put: async (request, response) => void store.set(keyOf(request), response),
			match: async (request) => store.get(keyOf(request)),
		};
	};
	const self = {
		location: { origin: ORIGIN },
		addEventListener: (type, handler) => listeners.set(type, handler),
		skipWaiting: () => {
			calls.skipWaiting += 1;
			return Promise.resolve();
		},
		clients: {
			claim: () => {
				calls.claim += 1;
				return Promise.resolve();
			},
		},
	};
	const caches = {
		open: async (name) => cacheFor(name),
		keys: async () => [...stores.keys()],
		delete: async (name) => stores.delete(name),
	};
	vm.runInNewContext(source, { self, caches, fetch: network, URL, Promise, console });
	return { listeners, stores, calls };
}

async function dispatchFetch(worker, pathname, mode) {
	let responded = null;
	worker.listeners.get("fetch")({
		request: { method: "GET", url: `${ORIGIN}${pathname}`, mode },
		respondWith: (value) => {
			responded = Promise.resolve(value);
		},
	});
	return responded ? await responded : null;
}

// 1. A new version must WAIT (the "Update ready → Reload now" banner asks the
//    user). Calling skipWaiting() during install made every deploy activate
//    at once and reload open tabs without consent — unsaved admin edits lost.
{
	const worker = loadWorker({ network: async () => fakeResponse(200, "network") });
	let installed;
	worker.listeners.get("install")({ waitUntil: (promise) => (installed = promise) });
	await installed;
	assert.equal(worker.calls.skipWaiting, 0, "install must not skip waiting on its own");
	const shell = [...worker.stores.entries()].find(([name]) => name.endsWith("-shell"))?.[1];
	assert.ok(shell?.has("/offline.html"), "install precaches the offline page");

	worker.listeners.get("message")({ data: { type: "SKIP_WAITING" } });
	assert.equal(worker.calls.skipWaiting, 1, "the user's Reload-now message activates the update");
}

// 2. Navigations are network-first, but only successful pages are cached:
//    a cached 500 or 404 would be replayed later as the "offline" copy.
{
	let status = 500;
	const worker = loadWorker({ network: async () => fakeResponse(status, `network ${status}`) });
	const failed = await dispatchFetch(worker, "/", "navigate");
	assert.equal(failed.status, 500, "the live error response is still returned to the page");
	const shellStore = () => [...worker.stores.entries()].find(([name]) => name.endsWith("-shell"))?.[1];
	assert.equal(shellStore()?.get("/"), undefined, "a 5xx navigation response must not be cached");

	status = 200;
	await dispatchFetch(worker, "/", "navigate");
	assert.equal(shellStore()?.get("/")?.status, 200, "a successful navigation is cached for offline use");
}

// 3. Gated pages and APIs are never intercepted (always straight to network).
{
	const worker = loadWorker({ network: async () => fakeResponse(200, "network") });
	for (const pathname of ["/projects", "/projects/owner/name", "/admin/users", "/notifications", "/settings", "/api/public/home"]) {
		assert.equal(await dispatchFetch(worker, pathname, "navigate"), null, `${pathname} must bypass the service worker`);
	}
}

// 4. Offline: a precached shell page is served; anything else gets offline.html.
{
	const worker = loadWorker({ network: async () => Promise.reject(new TypeError("offline")) });
	let installed;
	worker.listeners.get("install")({ waitUntil: (promise) => (installed = promise) });
	await installed;
	const fallback = await dispatchFetch(worker, "/never-visited", "navigate");
	assert.equal(fallback.label, "precached /offline.html", "unknown pages fall back to offline.html");
	const cachedHome = await dispatchFetch(worker, "/", "navigate");
	assert.equal(cachedHome.label, "precached /", "a precached page is served while offline");
}

console.log("service worker tests passed");
