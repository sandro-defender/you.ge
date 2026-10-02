export function trackEvent(name: string, detail: Record<string, unknown> = {}) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent("youge:analytics", {
			detail: {
				name,
				...detail,
				ts: Date.now(),
			},
		}),
	);
}
