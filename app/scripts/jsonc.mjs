/**
 * Minimal string-aware JSONC → JSON converter.
 *
 * WHY NOT REGEX?
 * A naive `.replace(/\/\*[\s\S]*?\*\//g, "")` before stripping `//` comments
 * is wrong for this project's wrangler.jsonc: a `//` comment contains an
 * opening slash-star sequence (`/api/*`) and a later string contains the cron
 * `0 ` + star + `/6 * * *`, so the block-comment regex eats every real config
 * line in between — `main`, `d1_databases`, `triggers` all vanish and
 * JSON.parse fails before any safety guard can run.
 *
 * This scanner respects string literals, so `https://…`, `/api/*` and the
 * cron expression are never treated as comments. Block and line comments are
 * handled in a single pass in source order.
 */
export function jsoncToJson(text) {
	let out = "";
	let i = 0;
	const n = text.length;

	while (i < n) {
		const c = text[i];

		// String literal — copy verbatim until the closing quote.
		if (c === '"') {
			out += c;
			i++;
			while (i < n) {
				const s = text[i];
				if (s === "\\") {
					out += s + (text[i + 1] ?? "");
					i += 2;
					continue;
				}
				out += s;
				i++;
				if (s === '"') break;
			}
			continue;
		}

		// Line comment — drop through end of line (newline itself is kept).
		if (c === "/" && text[i + 1] === "/") {
			while (i < n && text[i] !== "\n") i++;
			continue;
		}

		// Block comment — drop through */, outside of strings only.
		if (c === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
			i += 2;
			continue;
		}

		out += c;
		i++;
	}

	// Trailing commas are legal JSONC, not JSON.
	return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parse a wrangler.jsonc file's contents as JSONC. Throws on invalid JSON. */
export function parseJsonc(text) {
	return JSON.parse(jsoncToJson(text));
}
