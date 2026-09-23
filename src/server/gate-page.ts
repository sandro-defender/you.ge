/**
 * Branded "gate" pages — the designed 403 states rendered directly by the
 * Worker entry (src/server.ts) before TanStack Start is ever invoked.
 *
 * WHY THIS EXISTS (R4, HANDOVER §6 item 3)
 * The member/admin/banned refusals used to be `plainText(403, …)` — correct,
 * but raw unstyled text. These pages replace that with a designed state while
 * keeping the copy EXACTLY as it was, because the role-matrix smoke script
 * matches on body substrings ("not been granted", "Administrator") and — more
 * importantly — the same strings are asserted in production behaviour docs.
 * If you reword the copy, update scripts/role-matrix-smoke.sh to match.
 *
 * WHY INLINE CSS INSTEAD OF THE STYLESHEET
 * The app CSS is emitted by Vite under a content-hashed URL that only the
 * Start-rendered document knows. The Worker entry cannot ask Vite for it at
 * runtime, so these pages carry a tiny self-contained stylesheet that mirrors
 * the tokens in src/styles/app.css (bg #0a0a0f, accent #7c6cff, …). If you
 * retoken the app, mirror the change here.
 *
 * SECURITY NOTES
 * - Every interpolated string (notably `message`, which for banned users is
 *   the admin-set `banReason` database column) is HTML-escaped. banReason is
 *   stored text, not markup — rendering it raw would be a stored XSS from the
 *   admin panel into a page every banned visitor loads.
 * - `noindex, nofollow` mirrors the root route: gate pages are per-user
 *   states and must never end up in a search index.
 * - `cache-control: no-store` — the body depends on the caller's session, so
 *   no shared cache (or the browser back button) may retain it.
 */

/** Escape text for safe interpolation into HTML text nodes and attributes. */
export function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const GATE_CSS = `:root{color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;
background:#0a0a0f;color:#e8e8f0;
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Inter,"Helvetica Neue",Arial,sans-serif;
line-height:1.6;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:
radial-gradient(900px 500px at 15% -10%,rgba(124,108,255,.13),transparent 60%),
radial-gradient(700px 400px at 100% 0%,rgba(61,220,151,.07),transparent 55%)}
.wrap{width:100%;max-width:34rem;text-align:left}
.brand{font-weight:700;letter-spacing:-.03em;font-size:1.05rem;margin:0 0 1rem}
.brand a{color:inherit;text-decoration:none}
.brand a:hover{color:#9587ff}
.card{background:#12121a;border:1px solid #262633;border-radius:14px;padding:1.75rem;
box-shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.32)}
.badge{display:inline-flex;align-items:center;gap:.4rem;padding:.15rem .6rem;border-radius:999px;
font-size:.75rem;font-weight:550;border:1px solid #262633;background:#1a1a26;color:#9a9ab0;margin-bottom:1rem}
.badge-pending{background:rgba(124,108,255,.14);border-color:transparent;color:#9587ff}
.badge-denied{background:rgba(255,107,122,.14);border-color:transparent;color:#ff6b7a}
.badge-suspended{background:rgba(255,180,84,.14);border-color:transparent;color:#ffb454}
.badge code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.72rem}
h1{font-size:clamp(1.5rem,4vw,2rem);line-height:1.2;font-weight:650;letter-spacing:-.02em;margin:0 0 .6rem}
p{margin:0 0 1rem;color:#9a9ab0}
p.lede{color:#e8e8f0;font-size:1.02rem}
p.hint{font-size:.85rem;color:#6b6b80;border-top:1px solid #262633;padding-top:1rem;margin:1.25rem 0 0}
.actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.4rem}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:.55rem 1rem;border-radius:8px;
border:1px solid #3a3a4d;background:#12121a;color:#e8e8f0;font:inherit;font-size:.92rem;font-weight:550;
text-decoration:none;transition:background .15s,border-color .15s}
.btn:hover{background:#1a1a26;border-color:#7c6cff;text-decoration:none}
.btn-primary{background:#7c6cff;border-color:#7c6cff;color:#fff}
.btn-primary:hover{background:#9587ff;border-color:#9587ff}
@media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}`;

/** Visual severity of the gate — drives the badge colour and label. */
export type GateKind = "pending" | "denied" | "suspended";

/**
 * Render a gate page. `message` is escaped; pass it exactly as it should read.
 * `hint` (optional) renders as a dim secondary paragraph.
 */
export function gatePage(options: {
	status: number;
	kind: GateKind;
	title: string;
	message: string;
	hint?: string;
}): Response {
	const { status, kind, title, message, hint } = options;

	const badgeLabel =
		kind === "pending" ? "Access pending" : kind === "suspended" ? "Suspended" : "Restricted";

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0a0a0f">
<title>${escapeHtml(title)} — you.ge</title>
<style>${GATE_CSS}</style>
</head>
<body>
<main class="wrap">
<p class="brand"><a href="/">you.ge</a></p>
<section class="card" aria-labelledby="gate-title">
<span class="badge badge-${kind}"><code>${status}</code> ${badgeLabel}</span>
<h1 id="gate-title">${escapeHtml(title)}</h1>
<p class="lede">${escapeHtml(message)}</p>
${hint ? `<p class="hint">${escapeHtml(hint)}</p>\n` : ""}<div class="actions">
<a class="btn btn-primary" href="/">Back to home</a>
<a class="btn" href="/login">Sign-in options</a>
</div>
</section>
</main>
</body>
</html>`;

	return new Response(html, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}
