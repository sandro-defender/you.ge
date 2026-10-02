/**
 * Converts a public /api URL to the path Hono receives while preserving its
 * query string. OAuth callbacks carry the CSRF state in that query string.
 */
export function apiRequestUrl(url: URL): URL {
	const apiPath = url.pathname.slice("/api".length) || "/";
	return new URL(`${apiPath}${url.search}`, url);
}
