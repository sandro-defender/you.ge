import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal data-fetching hook for admin screens.
 *
 * Deliberately NOT TanStack Query. Adding a query library is reasonable later,
 * but for two admin tables it brings a provider, cache configuration and bundle
 * weight that buy nothing here — and one less dependency to keep compatible with
 * Vite 8 / Workers on a free tier.
 *
 * Handles the two things that are easy to get wrong by hand:
 *   - cancelling a setState after unmount (the `ignore` flag), and
 *   - not re-running on every render (the url-keyed effect).
 */
export function useApi<T>(url: string) {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [nonce, setNonce] = useState(0);

	// Guard against setting state on an unmounted component.
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		let ignore = false;
		setLoading(true);
		setError(null);

		void (async () => {
			try {
				const res = await fetch(url, {
					credentials: "same-origin",
					headers: { Accept: "application/json" },
				});
				const body = (await res.json().catch(() => null)) as
					| (T & { error?: string })
					| null;

				if (ignore || !mounted.current) return;

				if (!res.ok) {
					setError(body?.error ?? `Request failed (${res.status})`);
					setData(null);
					return;
				}
				setData(body as T);
			} catch (err) {
				if (ignore || !mounted.current) return;
				setError(err instanceof Error ? err.message : "Network error");
			} finally {
				if (!ignore && mounted.current) setLoading(false);
			}
		})();

		return () => {
			ignore = true;
		};
	}, [url, nonce]);

	const refetch = useCallback(() => setNonce((n) => n + 1), []);

	return { data, error, loading, refetch };
}

/**
 * POST/PATCH helper for admin mutations.
 *
 * Returns the parsed body, or throws with the server's own message so the UI can
 * show something more useful than "failed".
 */
export async function apiSend<T>(
	url: string,
	init: { method: "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
	const res = await fetch(url, {
		method: init.method,
		credentials: "same-origin",
		headers: {
			Accept: "application/json",
			...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
	});

	const body = (await res.json().catch(() => null)) as
		| (T & { error?: string; message?: string })
		| null;

	if (!res.ok) {
		throw new Error(body?.error ?? body?.message ?? `Request failed (${res.status})`);
	}
	return body as T;
}
