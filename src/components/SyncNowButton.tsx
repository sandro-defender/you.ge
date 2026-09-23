import { useCallback, useEffect, useRef, useState } from "react";
import { apiSend } from "../lib/use-api";
import type { SyncRun } from "../lib/types";
import { Toast, useToast } from "./Toast";

/**
 * "Sync from GitHub now" with a REAL pending state and a result toast (R5).
 *
 * POST /api/admin/sync returns immediately — the sync itself runs in
 * ctx.waitUntil — so simply disabling the button for the duration of the POST
 * (what the old code did) means it flashes "done" long before anything
 * happened. Instead: trigger → poll /api/admin/sync-log every 2s (max ~40s)
 * for a run newer than the trigger → toast the run's actual outcome
 * (ok + repoCount + duration, or its error status) → call onFinished so the
 * parent can refetch its tables.
 *
 * Used by both /admin/repos (refresh the curation table) and /admin
 * (refresh the sync-history card).
 */
export function SyncNowButton({
	onFinished,
	label = "Sync from GitHub now",
}: {
	onFinished?: () => void;
	label?: string;
}) {
	const [pending, setPending] = useState(false);
	const { toast, show, dismiss } = useToast();
	const dead = useRef(false);

	useEffect(
		() => () => {
			dead.current = true;
		},
		[],
	);

	const trigger = useCallback(async () => {
		if (pending) return;
		setPending(true);

		try {
			// Skew tolerance: a sync_log row written milliseconds after the POST
			// must still count as "the run we started".
			const startedAt = Date.now() - 1000;
			await apiSend("/api/admin/sync", { method: "POST" });

			let finished: SyncRun | null = null;
			for (let attempt = 0; attempt < 20 && !finished; attempt++) {
				await sleep(2000);
				if (dead.current) return;
				try {
					const { runs } = await apiSend<{ runs: SyncRun[] }>("/api/admin/sync-log", {
						method: "GET",
					});
					finished =
						runs.find((r) => runAtMs(r) >= startedAt) ?? null;
				} catch {
					// A failed poll is not a failed sync — keep polling.
				}
			}

			if (dead.current) return;

			if (!finished) {
				show("info", "Sync is still running — check the sync history in a moment.");
			} else if (finished.status === "ok") {
				show(
					"success",
					`Sync finished — ${finished.repoCount} repos in ${finished.durationMs}ms.`,
				);
			} else {
				show(
					"error",
					`Sync ${finished.status}: ${finished.message ?? "no details recorded"}`,
				);
			}
			onFinished?.();
		} catch (err) {
			if (!dead.current) {
				show("error", err instanceof Error ? err.message : "Could not start the sync.");
			}
		} finally {
			if (!dead.current) setPending(false);
		}
	}, [pending, show, onFinished]);

	return (
		<>
			<button
				type="button"
				className="btn btn-sm"
				onClick={() => void trigger()}
				disabled={pending}
				aria-live="off"
			>
				{pending ? (
					<>
						<span className="spinner" /> Syncing…
					</>
				) : (
					label
				)}
			</button>
			<Toast toast={toast} dismiss={dismiss} />
		</>
	);
}

function runAtMs(run: SyncRun): number {
	return run.runAt instanceof Date ? run.runAt.getTime() : Number(run.runAt);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
