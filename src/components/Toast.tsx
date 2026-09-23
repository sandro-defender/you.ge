import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal toast system (R5). One visible toast at a time is enough for admin
 * workflows — the alternative (a queue) buys nothing at this scale and costs
 * layout + focus-management complexity.
 *
 * Accessibility: success/info toasts are role=status (polite), errors are
 * role=alert (assertive), so screen readers announce outcomes of background
 * actions (like the GitHub sync) without moving focus.
 */

export type ToastKind = "success" | "error" | "info";
export type ToastState = { kind: ToastKind; message: string } | null;

export function useToast(timeoutMs = 6000) {
	const [toast, setToast] = useState<ToastState>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const dismiss = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		setToast(null);
	}, []);

	const show = useCallback(
		(kind: ToastKind, message: string) => {
			if (timer.current) clearTimeout(timer.current);
			setToast({ kind, message });
			timer.current = setTimeout(() => setToast(null), timeoutMs);
		},
		[timeoutMs],
	);

	// Clear the pending timer if the owning component unmounts.
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	return { toast, show, dismiss };
}

export function Toast({
	toast,
	dismiss,
}: {
	toast: ToastState;
	dismiss: () => void;
}) {
	if (!toast) return null;
	return (
		<div
			className={`toast toast-${toast.kind}`}
			role={toast.kind === "error" ? "alert" : "status"}
			aria-live={toast.kind === "error" ? "assertive" : "polite"}
		>
			<span>{toast.message}</span>
			<button
				type="button"
				className="toast-close"
				aria-label="Dismiss notification"
				onClick={dismiss}
			>
				×
			</button>
		</div>
	);
}
