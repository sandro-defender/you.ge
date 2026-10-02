import { useCallback, useEffect, useRef, useState } from "react";
import { apiSend } from "../lib/use-api";
import type { SyncRun } from "../lib/types";
import { Toast, useToast } from "./Toast";

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
			const kickoff = await apiSend<{ started: boolean; runId: number; message: string }>(
				"/api/admin/sync",
				{ method: "POST" },
			);

			if (!kickoff.started) {
				show("info", kickoff.message);
				onFinished?.();
				return;
			}

			let finished: SyncRun | null = null;
			for (let attempt = 0; attempt < 25 && !finished; attempt++) {
				await sleep(1600);
				if (dead.current) return;
				try {
					const { runs } = await apiSend<{ runs: SyncRun[] }>("/api/admin/sync-log", {
						method: "GET",
					});
					const current = runs.find((run) => run.id === kickoff.runId) ?? null;
					if (current && current.status !== "running") finished = current;
				} catch {
					/* keep polling */
				}
			}

			if (dead.current) return;

			if (!finished) {
				show("info", "Sync is still running — check the sync history in a moment.");
			} else if (finished.status === "ok") {
				show(
					"success",
					`Sync finished — ${finished.repoCount} repos, ${finished.discoveredCount} new, ${finished.durationMs}ms.`,
				);
			} else if (finished.status === "skipped") {
				show("info", finished.message ?? "Sync skipped.");
			} else {
				show("error", `Sync ${finished.status}: ${finished.message ?? "no details recorded"}`);
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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
