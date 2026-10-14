import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal toast system (R5). One visible toast at a time is enough for admin
 * workflows — the alternative (a queue) buys nothing at this scale and costs
 * layout + focus-management complexity.
 *
 * Accessibility: success/info messages go to a polite role=status region,
 * errors to an assertive role=alert region, so screen readers announce the
 * outcome of background actions (like the GitHub sync) without moving focus.
 * Both regions stay mounted while empty — a live region inserted together
 * with its text is not reliably announced — and are visually hidden; the
 * visible toast itself carries no role, so nothing is announced twice.
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
	return (
		<>
			<div className="sr-only" role="status">
				{toast && toast.kind !== "error" ? toast.message : ""}
			</div>
			<div className="sr-only" role="alert">
				{toast?.kind === "error" ? toast.message : ""}
			</div>
			{toast ? (
				<div className={`toast toast-${toast.kind}`}>
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
			) : null}
		</>
	);
}
