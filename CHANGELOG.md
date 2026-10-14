# Changelog

## 2026-10-14 — quality and security fixes

- Project detail pages open again: `/projects/:owner/:name` used to render the project library instead of the case study.
- Suspending a user now signs them out everywhere, and administrators can no longer suspend their own account. Previously a suspended administrator kept a working session.
- The public homepage no longer sends members-only case-study text (challenge, solution, case study) to signed-out visitors.
- Links from public pages into members-only pages now go through the access check, so signed-out visitors land on sign-in and pending accounts see "Access pending" instead of a broken library page.
- The site no longer reloads itself on a first visit or right after a deploy; updates wait for "Reload now".
- Unread badges show the real number of unread notifications instead of stopping at the page size.
- The homepage shows a clear message instead of endless loading placeholders when stats are unavailable, and an empty project library says so instead of blaming the filters.
- Accessibility: busy buttons keep an accessible name, the result count and toasts are announced to screen readers, Escape closes the mobile menu, and the error page keeps its skip-link target.

## 2026-10-02 — premium portfolio showcase upgrade

- Rebuilt the public experience with a premium dark visual system, richer metadata, custom branding assets, responsive navigation, and polished project cards.
- Added automated repository scoring, auto-featured highlights, homepage selection logic, project filtering, and detailed project pages powered by GitHub data in D1.
- Expanded repository curation with admin overrides for featured state, visibility, copy, tags, imagery, category, case study content, homepage placement, priority, and ordering.
- Added a stronger admin dashboard with operational overview cards, sync status/history, audit trail, notifications, and improved user/access management.
- Introduced an in-app notification center, admin/user notification records, audit logging, offline app-shell caching, update prompts, and browser-notification opt-in from Settings.
- Added tests for ranking/filtering, admin guards, notification audiences, sync batching, and service-worker registration.
