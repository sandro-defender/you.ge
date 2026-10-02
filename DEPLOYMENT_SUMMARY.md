# Deployment summary

## What changed

- **Stack preserved:** TanStack Start, React, Hono, better-auth, Cloudflare Workers, D1, Drizzle, and the existing Google OAuth + role model remain in place.
- **Data flow:** GitHub remains the repository source of truth; sync now computes portfolio scores and stores admin-safe curation metadata in D1.
- **Admin controls:** The owner can now manage featured state, visibility, title, description, tags, custom imagery, case-study fields, homepage visibility, priority, and sort order from the UI.
- **Operations:** Sync runs track status, discoveries, rate-limit context, and notifications. Important changes are mirrored into an audit log.
- **PWA polish:** Added manifest, favicon set, Apple icon, social preview image, service worker, offline fallback, and update-available messaging.

## Local verification completed

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run db:migrate:local`
- `npm run deploy:dry`
- Local health checks for `/`, `/login`, `/api/health`, `/projects`, `/admin`, `/notifications`, `/settings`, `/robots.txt`, `/sitemap.xml`, unknown 404s, and `og-image.jpg`
- Client bundle leak scan for `drizzle`, `api.github.com`, `BETTER_AUTH_SECRET`, `sqlite_master`, and `D1Database`

## Notes before production deploy

- Apply the new D1 migration remotely with the existing safety workflow before production release.
- The new admin notifications and audit features rely on the added `audit_log` and `notifications` tables plus the expanded `repos` and `sync_log` columns.
- Browser notification permission remains **opt-in only** from `/settings`; the app never prompts automatically.
