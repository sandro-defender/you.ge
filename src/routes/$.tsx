import { createFileRoute, notFound } from "@tanstack/react-router";

/**
 * Catch-all 404.
 *
 * `$` is TanStack Router's splat route: it matches any path not claimed by a
 * more specific route. It exists purely to funnel those paths into the
 * router's Not Found flow — `beforeLoad` throws `notFound()`, which makes the
 * SSR response a real **HTTP 404** and renders the root route's
 * `notFoundComponent` (`src/components/NotFound.tsx`).
 *
 * Before R7 the splat *rendered* the 404 UI as a matched component, so
 * unknown paths returned 200 + "Nothing here" — a soft 404 that search
 * engines would index as content.
 *
 * The `head()` title does not reliably apply to not-found renders (the
 * throw skips the route's own head contribution), so the root default title
 * is what shows; acceptable for an error page.
 */
export const Route = createFileRoute("/$")({
	beforeLoad: () => {
		throw notFound();
	},
});
