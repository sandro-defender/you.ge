# you.ge — gated portfolio

A modern, permission-gated portfolio for **you.ge**, deployed as a **single
Cloudflare Worker on the Free plan with D1 only**. It shows the owner's GitHub
projects (synced into D1 on a cron), requires **Google OAuth sign-in**, and has
an **admin panel** where you grant per-user access.

**Stack:** TanStack Start (React SSR) · Hono (`/api/*`) · better-auth 1.7.5
(Google OAuth, RBAC, admin plugin) · Drizzle ORM · D1 · `@cloudflare/vite-plugin`.

Design decisions and their rationale live in [`HANDOVER.md`](./HANDOVER.md)
(§2 = why this stack, §4 = architecture). This README is the day-to-day
operator/manual reference. **Every “contradicts tutorials” fact below was
verified against the installed packages in `node_modules` (or by probing at
runtime), not from docs or memory.**

The project lives at the repo root — this directory is the whole project.

---

## Quick start

```bash
npm ci
npm run db:migrate:local    # local Miniflare SQLite only (binding "DB")
npx vite dev                 # http://localhost:3000
```

Copy `.dev.vars.example` → `.dev.vars` and fill in the secrets before sign-in
can work (see [Secrets](#secrets) and [Google OAuth](#google-oauth)).

Already deployed and running? Day-2 operations (redeploy, rotate secrets,
revoke access, read the sync log, watch errors) live in the
[Owner runbook](#owner-runbook--day-2-operations-r8).

Other everyday commands:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (serves `src/server.ts` through the Cloudflare plugin) |
| `npm run build` | Production build → `dist/server/` (Worker) + `dist/client/` (assets) |
| `npm run preview` | Preview the built worker locally |
| `npm run typecheck` | `tsc --noEmit` — must stay at 0 errors |
| `npm run d1:safety` | D1 migration guard (see [D1 safety](#d1-safety)) — **expect exit 1 while `database_id` is a placeholder** |
| `npm run d1:setup` | Lists every D1 database (read-only, marks others DO NOT TOUCH); **creates `you-ge-main` and wires its id into wrangler.jsonc only if no `you-ge*` database exists yet** |
| `npm run db:migrate:local` | Apply `drizzle/` migrations to the **local** Miniflare DB |
| `npm run db:generate` | Generate a migration from schema changes (drizzle-kit) |
| `npm run db:studio` | Drizzle Studio (local DB) |
| `npm run auth:grant-admin` | Grant/revoke a role for a signed-in user (`node scripts/grant-admin.mjs you@example.com`) — **not** the better-auth CLI (see HANDOVER §7) |
| `npm run auth:info` | Print better-auth runtime info |
| `npm run test:next` | Open-redirect guard tests for `?next=` (16 unit cases + 6 HTTP probes; HTTP part needs the dev server, add `--strict` to require it) |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run deploy` | `vite build` + `wrangler deploy -c dist/server/wrangler.json` |
| `npm run deploy:dry` | Same but `--dry-run` (no deploy) |

### Smoke tests (re-run after any change)

From HANDOVER §5 — all must hold with **no cookies**:

| Request | Expected |
|---|---|
| `GET /` | **200**, real server-rendered HTML (`<!DOCTYPE html>`, `<title>`, stylesheet link) |
| `GET /login` | **200**, contains `Continue with Google` |
| `GET /api/health` | **200** |
| `GET /projects` | **302** → `/login?next=%2Fprojects` |
| `GET /projects/foo` | **302**, `next` preserved |
| `GET /admin`, `GET /admin/users` | **302** |
| `GET /api/projects`, `GET /api/admin/repos` | **401** |
| `GET /projects` **with a forged `x-youge-session: {"role":"admin",…}` header** | **302**, *not* 200 — the header is stripped before anything reads it |
| `GET /projects` **with a forged `x-youge-session: {"role":"admin",…}` header** | **302**, *not* 200 — the header is stripped before anything reads it |
| `GET /robots.txt` | **200**, `text/plain` — Disallow /projects /admin /login /api/, Sitemap line (R7) |
| `GET /sitemap.xml` | **200**, `application/xml`, contains only `https://you.ge/` (the sole indexable URL) |
| `GET /totally-bogus` | **404** with the branded Not Found body — *not* a 200 soft-404 (R7) |
| `GET /og.jpg` | **200**, `image/jpeg` — the share-card image (1200×630) |

Client-bundle leak check after `npm run build` (all must say `clean`):

```bash
for n in drizzle api.github.com BETTER_AUTH_SECRET sqlite_master D1Database; do
  printf '%-22s ' "$n"; grep -rqi "$n" dist/client/ && echo '⚠ FOUND' || echo clean
done
```

> `better-auth` itself **will** appear in `dist/client/` — that is legitimate
> (`better-auth/client`). What must never appear is server config plumbing:
> secret-name accessors, Drizzle, SQL, GitHub API URLs, D1 types.
> Known-and-accepted: the admin Repos page ships the literal strings
> `GITHUB_USERNAME` / `GITHUB_TOKEN` as *UI hint text* for the empty state —
> names, never values.

With fixtures + the dev server up, also run the two behavioural suites (both
local-only):

| Script | What it asserts |
|---|---|
| `bash scripts/role-matrix-smoke.sh` | 40 checks (10 unit + 30 HTTP): `hasRole` unit attack-table + page/API rows for no-session/user/member/admin/expired/banned/garbage-role, member→`/api/auth/admin/list-users` 403, forged-header probes. The page 403s are the designed gate pages (`src/server/gate-page.ts`) — **the copy is load-bearing**, the script matches on `not been granted` / `Administrator` |
| `npm run test:next` | 22 checks: the `?next=` open-redirect guard — unit attack-table against `src/lib/next.ts` + HTTP probes that `/login?next=…` never redirects off-origin and the gate 302 preserves the encoded destination |

---

## Architecture in one screen

```
request ──▶ src/server.ts (Worker entry — the security boundary)
              1. strip x-youge-session header        ← forgery guard
              2. /api/*  ─────────────▶ Hono
              │     /api/auth/*   → better-auth (Google OAuth, admin plugin)
              │     /api/projects → session required   (guard.ts)
              │     /api/admin/*  → admin role required (guard.ts)
              3. gated page prefix? (ACCESS_POLICY)
              │     no session     → 302 /login?next=…
              │     banned         → 403
              │     not admin      → 403 on /admin*
              │     ok             → inject validated session header, SSR renders
              4. else ─▶ TanStack Start renders
scheduled() ──▶ GitHub API → D1 (free; cron every 6h, wrangler.jsonc)
```

* **Why gating lives in the Worker entry:** Start's handler is
  `(request, options?) => Response` — it never receives `env`, and this
  dependency set has no `getCloudflareContext()`. `fetch(request, env, ctx)`
  is the only place with both the request and D1, so permission checks run
  *before* React (a 302/403, never gated HTML). See HANDOVER §4.
* **How the session reaches React without a second DB read:** the Worker
  validates once and forwards a projection on the internal header
  `x-youge-session`; `src/lib/session-fn.ts` reads it via `getRequestHeaders()`.
  The header name lives in `src/lib/internal-header.ts`, a dependency-free
  leaf — importing it from `src/server.ts` would drag Hono + better-auth +
  Drizzle into the browser bundle.
* **Why `/projects` fetches in `useEffect`, not `loader`:** a route loader
  running on the server that fetched `/api/projects` would make the Worker
  call itself and deadlock the isolate. The loader only reads the internal
  header (memory, no I/O); the list loads client-side after hydration.
* **Quota model (Workers Free):** static assets are free/unlimited; SSR page
  views cost 1 of 100k requests/day; session checks are served from
  better-auth's 5-minute `cookieCache` (≈0 D1 rows); cron invocations are
  free. Never add a session `refetchInterval`; all lookups are indexed.
  Full table in HANDOVER §10.

### Access model (implemented: explicit role grant)

Chosen by the owner: **role check**, not an `access_granted` column.
Three roles live in `src/lib/roles.ts` / `src/lib/auth-roles.ts`:

| Role | Granted by | Can reach |
|---|---|---|
| `user` | Google sign-in (default) | nothing gated |
| `member` | admin sets it in `/admin/users` | `/projects`, `/api/projects` |
| `admin` | `node scripts/grant-admin.mjs <email>` (after first Google sign-in) | everything member can + `/admin*` |

Enforced in **two places that must agree**: `ACCESS_POLICY` in `src/server.ts`
(pages) and `requireMember`/`requireAdmin` in `src/server/guard.ts` (API).
The same `siteRoles` map is passed to `admin({ roles })` (server — validates
setRole submissions, drives `hasPermission`) and `adminClient({ roles })`
(client — widens `setRole` types to include `member`). Verify with
`scripts/role-matrix-smoke.sh` (40 checks: no-session, user, member, admin,
expired, banned, garbage role).
Page refusals render the branded gate pages from `src/server/gate-page.ts`
(pending / restricted / suspended) with the exact same copy as the API 403
bodies — change them together or neither.

**Last-admin protection:** better-auth 1.7.5 does NOT stop the only admin
from demoting themselves (verified in the installed source). A
`databaseHooks.user.update.before` guard in `src/lib/auth.ts` rejects any
role demotion from `admin` when it would leave zero admins — 400 with an
explanatory message, covering both `/admin/set-role` and
`/admin/update-user`. `scripts/grant-admin.mjs` bypasses hooks by design:
it is the lockout recovery tool.

Admin bootstrap: sign in with Google once (creates the `user` row), then
`node scripts/grant-admin.mjs you@example.com` — a `user.role` UPDATE through
`wrangler d1 execute`, exactly what better-auth's own `setRole` does under the
hood. The better-auth CLI's `create-admin` **cannot** work against this
factory-based D1 config (HANDOVER §7).

### Security & error handling (R6)

- **Security headers everywhere:** `/api/*` gets Hono's `secureHeaders()`
  (11 defaults, COEP off). Pages, the login 302 and the gate pages are
  rendered by the Worker and never touch Hono — they carry the same 11
  headers via `PAGE_SECURITY_HEADERS` in `src/server.ts` / `gate-page.ts`.
- **Errors never leak:** every route loader is wrapped in `safeLoader()`
  (`src/lib/safe-loader.ts`) — the real error goes to `console.error`
  (see it with `wrangler tail`), the browser only ever gets a generic
  message. This matters because TanStack Start serialises a failed
  loader's error message into the dehydrated router state of the 500
  body — without the wrapper, a D1/Drizzle error would ship its SQL.
  On top of that: `__root.tsx` renders a branded errorComponent (no
  `error.message` anywhere) and the Worker catch-all renders
  `serverErrorPage()` (500, `no-store` + the same 11 headers).
- **No caching of anything auth-adjacent:** `/api/health`, gate and error
  pages send `no-store`. Static assets under `/assets/` have hashed
  filenames, so long-lived caching is free and safe.
- **Known, accepted gap (owner call pending):** no rate limiting on
  `/api/auth/*` — Workers Free has none built-in.
- **SEO (R7):** the ONLY indexable page is `/` (robots `index, follow`,
  canonical, OG/Twitter card with `public/og.jpg`); every other route
  inherits a fail-closed `noindex` default, gate pages also send
  `X-Robots-Tag: noindex`, and `robots.txt`/`sitemap.xml` are served at the
  Worker entry (no deps). Unknown paths return a real **404** (the `$`
  splat throws `notFound()`), not a soft-200. No project names ever appear
  in a public page's `<head>`.

---

## D1 safety — non-negotiable

**Never create, read, migrate, or touch any D1 database in the Cloudflare
account except this project's own: a database whose name starts with the
reserved prefix `you-ge` (recommended: `you-ge-main`) AND is provably ours —
empty, or carrying this project's migration history. Local Miniflare SQLite (`--local`)
is fine. Never run anything with `--remote` against a database that fails the
prefix or ownership checks.**

* `scripts/d1-safety-check.mjs` runs automatically before
  `npm run db:migrate:remote` and refuses unless:
  1. `database_name` starts with `you-ge` (owner-settled prefix rule),
  2. that name resolves to the configured `database_id`,
  3. the target is **provably ours**: empty (fresh), or its `d1_migrations`
     history matches a file in `drizzle/` (our own live DB — owner policy
     2026-09-24). Tables with **no** recognised history are treated as
     someone else's database and refused. The `d1 execute --json` envelope
     parse is fail-closed: an unrecognised output shape aborts rather than
     passing.
* The migrate scripts use the **binding name** `DB`, so they always follow
  `wrangler.jsonc` (wrangler resolves "the name or binding of the DB") — no
  hardcoded name to drift from the config.
* Its JSONC parsing uses `scripts/jsonc.mjs` — a **string-aware scanner**.
  Do not “simplify” it back to regexes: `wrangler.jsonc` contains `/api/*`
  inside a `//` comment and the cron `"0 */6 * * *"` inside a string, and a
  block-comment-before-line-comment regex silently deletes `main`,
  `d1_databases` and `triggers` before any guard runs (this exact bug was
  found and fixed; see `git log` for `jsonc.mjs`).
* `scripts/d1-setup.mjs` lists all databases read-only (unprefixed ones are
  marked DO NOT TOUCH) and, when no `you-ge*` database exists, **creates
  `you-ge-main` and wires its uuid into wrangler.jsonc itself** (owner
  instruction 2026-09-24). It never touches an unprefixed database, never
  auto-wires an *existing* prefixed one (existing ≠ provably ours), and never
  migrates anything — that stays behind `db:migrate:remote` + the safety
  check. Both scripts carry a `--self-test` that verifies their pure logic
  offline (`node scripts/d1-safety-check.mjs --self-test`).
* Workers Free D1 caps (since 2026-09-01, exceeding a daily cap **hard-fails
  every query** until 00:00 UTC): 5M rows **scanned**/day, 100k rows
  written/day, 5 GB storage. Indexes are quota control, not just perf.

---

## First deploy (owner-run — needs the real Cloudflare account)

Run from the repo root, in order. The D1 name must start with the reserved
prefix `you-ge` (recommended concrete name: `you-ge-main` — the scripts
enforce the prefix; see [D1 safety](#d1-safety)):

```bash
npm run d1:setup                                   # lists existing DBs; creates
                                                   # you-ge-main + wires its id
                                                   # if no you-ge* DB exists yet
# (equivalent by hand: npx wrangler d1 create you-ge-main, then paste the
#  printed uuid into wrangler.jsonc "database_id")
npm run d1:safety                                  # must pass now (exit 0)
npm run db:migrate:remote                          # chains the safety check first
npx wrangler secret put BETTER_AUTH_SECRET         # generate: openssl rand -base64 32
# R2:  npx wrangler secret put GOOGLE_CLIENT_ID && npx wrangler secret put GOOGLE_CLIENT_SECRET
# R3:  npx wrangler secret put GITHUB_TOKEN        # optional; sync degrades without it
npm run deploy                                     # vite build + wrangler deploy
curl -s -o /dev/null -w '%{http_code}\n' https://you.ge/api/health           # 200
curl -s -o /dev/null -w '%{http_code}\n' https://you.ge/api/auth/get-session # 200
# admin bootstrap AFTER the owner's first Google sign-in:
node scripts/grant-admin.mjs you@example.com
```

`wrangler.jsonc` contains `"routes": [{ "pattern": "you.ge", "custom_domain": true }]`
so the Worker answers at `https://you.ge` (the better-auth/Google origin).
If `wrangler deploy` reports the zone is not in the account, either add the
`you.ge` zone to Cloudflare or remove that block and use the
`you-ge.<account>.workers.dev` URL meanwhile.

### Deploy with GitHub Actions (CI)

`.github/workflows/deploy.yml` runs the same pipeline (guards → typecheck →
safety-checked migrations → build → deploy → health check) on every push to
`main`, and on demand via `gh workflow run deploy.yml` / the Actions tab. Use
it when the deploying machine cannot reach `api.cloudflare.com` itself (e.g.
agent sandboxes) or you simply want push-to-deploy.

One-time setup — values live only in the two dashboards, never in chat/repo:

1. **Cloudflare → My Profile → API Tokens → Create Token** — template
   **Edit Cloudflare Workers**, plus `Account | D1 | Edit` and
   `Zone | Workers Routes | Edit` (the `you.ge` custom domain), scoped to the
   account and the `you.ge` zone.
2. **GitHub → Settings → Secrets and variables → Actions** —
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (required); optionally
   `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `APP_GITHUB_TOKEN` (→ becomes the `GITHUB_TOKEN` Worker secret; the names
   differ because GitHub reserves `secrets.GITHUB_TOKEN` for the workflow's
   own token). Runtime secrets not stored in GitHub can still be set any time
   via `wrangler secret put` or the Cloudflare dashboard.

First-ever deploy: dispatch with `create_db: true` — the job creates
`you-ge-main`, wires its uuid **in the runner workspace**, and prints the
uuid in the step summary. Pin it into `wrangler.jsonc` and commit (or the
next run's safety check refuses: an existing unpinned DB is "not provably
ours"). `grant_admin_email` on a dispatch runs the admin bootstrap
post-deploy. Without those inputs, a dispatch (or push) just migrates
(idempotent), deploys, and health-checks.

### Secrets

Set locally in `.dev.vars` (gitignored; see `.dev.vars.example`), in
production via `wrangler secret put`:

| Secret | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Signs better-auth session cookies (32+ chars) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth (client id comes from vars if needed) |
| `GITHUB_TOKEN` | PAT for the 6-hourly repo sync (5,000 req/h vs 60) — optional |
| `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID` | Optional overrides |

Vars (non-secret, in `wrangler.jsonc`): `GITHUB_USERNAME`, `APP_URL`.

### Google OAuth

Google Cloud Console → OAuth client → Web application. Authorized redirect
URIs must be **exactly**:

```
http://localhost:3000/api/auth/callback/google
https://you.ge/api/auth/callback/google
```

A mismatch fails *every* sign-in and the cause is invisible from the browser.
Local dev needs `.dev.vars` filled in; production needs
`wrangler secret put GOOGLE_CLIENT_SECRET`.

---

## Owner runbook — day-2 operations (R8)

Everything below assumes the first deploy already happened. All commands run
from the repo root. **Nothing here needs agent access** — it is the complete
day-2 operator manual.

### Redeploy after pulling changes

Merged to `main` and the CI secrets from
[Deploy with GitHub Actions](#deploy-with-github-actions-ci) are in place?
Pushing is enough — the workflow does the rest. By hand:

```bash
git pull
npm ci
npm run typecheck        # must stay at 0 errors
npm run build            # catches bundling surprises before deploy
npm run deploy           # vite build + wrangler deploy -c dist/server/wrangler.json
# smoke the live site:
curl -s -o /dev/null -w '%{http_code}\n' https://you.ge/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://you.ge/robots.txt   # 200
curl -s https://you.ge/ | grep -o '<title>[^<]*</title>'              # you.ge — Sandro's web projects
```

### Apply a new migration to the live DB

Just run `npm run db:migrate:remote`. The safety guard accepts your own
database once it recognises this project's migration history in
`d1_migrations` (owner policy 2026-09-24: writes allowed to databases
created by this project) — so day-2+ migrations on `you-ge-main` need no
flags.

What it still refuses, always: a database with tables but **no migration
history this project recognises** — that is treated as someone else's
database. If you are certain a target is a disposable abandoned attempt of
ours, the deliberately-ugly override is:

```bash
node scripts/d1-safety-check.mjs --allow-non-empty && \
npx wrangler d1 migrations apply DB --remote
```

Never use that flag to point at anything unprefixed.

### Rotate a secret

```bash
npx wrangler secret put BETTER_AUTH_SECRET       # openssl rand -base64 32
npx wrangler secret put GOOGLE_CLIENT_SECRET     # after creating it in Google Cloud Console
npx wrangler secret put GITHUB_TOKEN             # after creating a new fine-grained PAT
```

Effects, so nothing surprises you:

- **`BETTER_AUTH_SECRET`** invalidates every session cookie — all users
  (including you) simply sign in again. No data is lost; old session rows
  expire out of D1 on their own.
- **`GOOGLE_CLIENT_SECRET`** only takes effect for new sign-ins; already
  signed-in sessions are unaffected.
- **`GITHUB_TOKEN`** is only read by the cron sync; a bad token degrades
  the sync (logged, surfaced in /admin), it never breaks the site.
- Local dev has its own secrets in `.dev.vars` — rotate that file separately
  (`node scripts/seed-local-test-users.mjs --cookies` re-mints fixture
  cookies bound to the new secret).

### Revoke someone's access

All of it happens on **/admin/users** (sign in as an admin):

| Action | Effect | When it lands |
|---|---|---|
| Role → `user` | loses `/projects` (member gate 403) | next request; an **already-open browser tab** can keep access up to ~5 min (session `cookieCache`, see `src/lib/auth.ts` — accepted trade-off) |
| Ban | signs them out everywhere (sessions deleted) + suspended page if they sign back in | same ~5-min worst case for an open tab |
| Revoke sessions | signs them out everywhere, keeps the account | same |
| Role → `member` | grants `/projects` | immediate on their next request |

If you are locked out of admin entirely (e.g. you demoted yourself — the
server blocks the *last* admin demotion, but a second admin could demote
you): `node scripts/grant-admin.mjs you@example.com` re-grants via
`wrangler d1 execute` directly. It is the designated lockout-recovery tool.

### Check the GitHub sync / read sync_log

- **/admin** (overview) shows recent sync runs with real outcomes.
- Raw, from anywhere:

```bash
npx wrangler d1 execute DB --remote --command \
  "SELECT run_at, status, repo_count, duration_ms, message FROM sync_log ORDER BY run_at DESC LIMIT 10;"
```

- Trigger a sync without waiting for the cron: **Sync now** on /admin or the
  repos page (POST /api/admin/sync), then watch the same list.

### Watch live errors

```bash
npx wrangler tail                    # live console.error/log stream
npx wrangler tail --format pretty    # easier to read
```

Loader/render failures log the real error server-side and show the visitor
only a generic 500 page (by design — see "Security & error handling"), so
`tail` is where the truth lives.

### Local dev from a clean clone

```bash
git clone <repo> && cd you.ge
npm ci
cp .dev.vars.example .dev.vars    # fill in at least BETTER_AUTH_SECRET (any 32+ chars)
npm run db:migrate:local          # local Miniflare SQLite (binding "DB")
npx vite dev                      # http://localhost:3000
```

Optional but recommended for testing access levels:

```bash
node scripts/seed-local-test-users.mjs > /tmp/seed.sql
npx wrangler d1 execute DB --local --file /tmp/seed.sql
node scripts/seed-local-test-users.mjs --cookies   # ready-made Cookie headers
bash scripts/role-matrix-smoke.sh                  # expect: pass=40 fail=0
npm run test:next                                   # expect: pass=22 fail=0
```

Google sign-in locally additionally needs `GOOGLE_CLIENT_ID` +
`GOOGLE_CLIENT_SECRET` in `.dev.vars` with the localhost redirect URI
registered (see [Google OAuth](#google-oauth)). Without them the site works
fine — only the "Continue with Google" round-trip cannot.

---

## The 12 facts that contradict tutorials

Each was verified against the installed packages. **Do not “fix” these.**

1. **`authClient.useSession` is NOT a React hook in better-auth 1.7.5.**
   It is a nanostores Atom (`eq/get/init/lc/listen/notify/off/set/subscribe/
   value/events`). Calling it throws `TypeError: useSession is not a
   function` and fails typecheck with TS2349. Use `useAuthSession()` from
   `src/lib/auth-client.ts`, which wraps the plain `getSession()` function.
   Most better-auth tutorials online are written for 1.4.x and are wrong here.

2. **TanStack Start 1.168 has no `server: { handlers: {} }` route option**
   and does not export `createServerRoute`. The pattern in several blog posts
   does not exist in this version. Verified: `createFileRoute` has no `server`
   key and no package under `node_modules/@tanstack` contains
   `createServerRoute`.

3. **The router entry must be `src/router.tsx` and must export `getRouter`.**
   `required: true` in the plugin's entry plan, resolved relative to `src/`.
   Naming it anything else (e.g. `createAppRouter`) fails the build with
   `MISSING_EXPORT: "getRouter" is not exported by "src/router.tsx"`.

4. **better-auth has no `d1Adapter()`.** You must use
   `drizzleAdapter(db, { provider: "sqlite" })`.

5. **The admin plugin has TWO authorization layers** — your middleware *and*
   its internal DB check `user.role === "admin"`. Granting admin only via an
   env allowlist yields 403 on every `/api/auth/admin/*` call while your own
   routes work. Bootstrap the first admin with `node scripts/grant-admin.mjs`
   **after their first Google sign-in**. (The better-auth CLI's
   `create-admin` cannot reach this app's database at all — see HANDOVER §7.)

6. **Do not use `secondaryStorage` (KV) for sessions.** better-auth checks it
   *before* the DB and short-circuits on a hit, so a KV-backed session is
   served from a stale colo after revocation. Sessions live in D1 only.

7. **No Durable Objects** — they require Workers Paid. Multi-tab session sync
   would need `BroadcastChannel` + polling, and polling is a quota hazard
   (50 tabs × 30s = 144k requests/day). Not implemented; not needed yet.

8. **`@cloudflare/workers-types` must NOT be in tsconfig `types`.**
   `wrangler types` generates `worker-configuration.d.ts` including runtime
   types and says so explicitly. Listing both produces duplicate globals.
   `@types/node` IS required because `nodejs_compat` is enabled.

9. **`wrangler.jsonc` `main` must be `src/server.ts`**, not build output.
   Pointing it at `dist/server/index.js` makes `vite dev` serve that stale
   artifact directly instead of compiling `src/`, so code changes silently do
   nothing and a fixed bug can keep throwing its old error
   (`useSession is not a function` — caught exactly this way).

10. **`Env` must extend the generated `Cloudflare.Env`.** With
    `--strict-vars` (default), wrangler types `vars` as *string literals*
    (`GITHUB_USERNAME: "sandro-defender"`). A hand-written structural `Env`
    with `string | undefined` is mutually unassignable with it → TS2345.
    Fixed in `src/lib/env.ts` as `Cloudflare.Env & Secrets`.

11. **`migrations_dir: "drizzle"` must be set on the D1 binding.** Wrangler
    defaults to `./migrations`; drizzle-kit writes to `./drizzle`. Without
    this, `migrations apply` reports “no migrations to apply” and looks like
    success while leaving every query failing with `no such table`.

12. **`startHandler.fetch(request)` takes 1 arg**, not the Worker triple.

### Bonus facts (discovered during verification, equally load-bearing)

13. **The root route must render the full document** —
    `<html><head><HeadContent /></head><body>…<Scripts /></body></html>`.
    Without `<HeadContent />`, every `head()` entry (title, meta, the
    `app.css` `?url` stylesheet link) is computed and thrown away: the
    response has no `<head>` at all. Without `<Scripts />`, the initial
    hydration tags are never claimed at their proper place. React 19 only
    prepends `<!DOCTYPE html>` when the root element is `<html>`; a fragment
    root ships a doctype-less response (quirks mode). Canonical shape matches
    the skill docs shipped inside the installed package:
    `node_modules/@tanstack/react-start/skills/react-start/SKILL.md`.

14. **`better-auth/client` itself pulls `@better-auth/core/env` into the
    browser graph** — `createAuthClient` → `client/config.mjs` →
    `utils/url.mjs` → `@better-auth/core/env`, whose top level
    `Object.freeze({ get BETTER_AUTH_SECRET() {…}, … })` survives
    tree-shaking (unannotated call). The old fix (dropping
    `typeof import("./auth")` from `auth-client.ts`) closed only one path.
    Current fix: a `resolveId` plugin with `enforce: 'pre'` gated on
    `this.environment.name === "client"` (Vite has **no** per-environment
    alias — alias is explicitly *not* a per-environment option) serves the
    faithful browser stub `src/build/better-auth-core-env-client-stub.ts`.
    The SSR/Worker build still gets the real module. Keep the §5 leak check
    green.

15. **`wrangler.jsonc` comment stripping must be string-aware**
    (`scripts/jsonc.mjs`). See [D1 safety](#d1-safety).

---

## Layout

```
.                              ← repo root = the whole project
├── HANDOVER.md                 ← full handover: state, architecture, research notes
├── README.md                   ← this file
├── package.json                scripts (see Quick start)
├── wrangler.jsonc              main=src/server.ts, D1 binding, cron */6h, you.ge route
├── vite.config.ts              cloudflare() FIRST, then tanstackStart(), react(),
│                               then the client-only better-auth env stub plugin
├── tsconfig.json               types: ["node","vite/client"] — NOT workers-types
├── drizzle.config.ts           dialect sqlite, no dbCredentials (correct)
├── worker-configuration.d.ts   GENERATED by `npm run cf-typegen` — commit it
├── .dev.vars.example           every secret + Google redirect URIs documented
├── public/
│   └── og.jpg                   1200×630 share-card image (og:image)
├── scripts/
│   ├── d1-safety-check.mjs     migration guard (runs before any --remote)
│   ├── d1-setup.mjs            read-only DB listing
│   ├── grant-admin.mjs         role grant/revoke via wrangler d1 (admin bootstrap)
│   ├── seed-local-test-users.mjs  local fixtures + --cookies
│   ├── role-matrix-smoke.sh    40-check E2E gate test (10 unit + 30 HTTP)
│   ├── next-guard-test.mjs     ?next= open-redirect guard tests (unit + HTTP)
│   └── jsonc.mjs               string-aware wrangler.jsonc parser (shared)
├── drizzle/                    migrations (drizzle-kit output)
└── src/
    ├── server.ts               ⭐ Worker entry: forgery guard + gating + /api + cron
    ├── router.tsx              must export getRouter (fact #3)
    ├── routeTree.gen.ts        GENERATED from src/routes/
    ├── styles/app.css          design tokens, dark theme, no framework
    ├── build/
    │   └── better-auth-core-env-client-stub.ts   browser env stub (fact #14)
    ├── db/                     schema barrel + schema-auth (generated) + schema-app
    ├── lib/
    │   ├── env.ts              Env = Cloudflare.Env & Secrets (fact #10)
    │   ├── auth.ts             createAuth(env) factory — per request
    │   ├── auth-client.ts      browser client + useAuthSession() (fact #1)
    │   ├── internal-header.ts  leaf module, no deps
    │   ├── next.ts             sanitiseNext — ?next= open-redirect guard (leaf)
    │   ├── session-fn.ts       createServerFn reading the internal header
    │   ├── safe-loader.ts       sanitising loader wrapper — no error leakage
    │   ├── types.ts            PublicProject/AdminRepo/SyncRun (client+server)
    │   └── use-api.ts          useApi + apiSend, no TanStack Query
    ├── server/
    │   ├── app.ts              Hono root: services → secureHeaders → routes
    │   ├── context.ts          createServices(env) — one per request
    │   ├── auth-routes.ts      sub.all("/*") → auth.handler(raw)
    │   ├── guard.ts            requireSession, requireAdmin
    │   ├── gate-page.ts        branded 403 gate pages (Worker-rendered, escaped)
    │   ├── repos-router.ts     /projects, /projects/by-slug (indexed reads)
    │   ├── admin-router.ts     /admin/repos CRUD + /sync + /sync-log (200-char desc cap)
    │   └── github-sync.ts      ⭐ cron sync, single multi-row upsert
    ├── components/
    │   ├── Nav.tsx             session-aware nav
    │   ├── NotFound.tsx          branded 404 body (root notFoundComponent)
    │   ├── SyncNowButton.tsx   sync → poll sync-log → outcome toast
    │   └── Toast.tsx           one-slot toast, a11y roles
    └── routes/
        ├── __root.tsx          ⭐ document shell + head()/OG defaults +
        │                          notFound/error components (facts #13/#17)
        ├── index.tsx           public landing
        ├── login.tsx           Google sign-in, sanitised ?next= (open-redirect guard)
        ├── projects.tsx        gated; useEffect fetch (HANDOVER §4)
        ├── $.tsx               splat → notFound() → real 404 (fact #17)
        └── admin/              layout + overview + users (grant/revoke) + repos
```

---

## Gotchas worth knowing before you change anything

* **Never prerender a gated route** (`/admin*`, `/projects*`). A prerendered
  file is served from `assets.directory` *without* invoking the Worker —
  publishing gated HTML to everyone. There is deliberately no top-level
  `assets` block in `wrangler.jsonc`.
* **Never add a session `refetchInterval`.** Polling burns both the 100k
  req/day Worker budget and D1 rows-read (HANDOVER §10).
* **Admin curation survives syncs by design:** `github-sync.ts` upsert
  excludes `featured`, `hidden`, `sortOrder`, `customDescription` from its
  `set` list — do not “optimize” those columns into the upsert.
* **Import protection:** client code must not import from server modules,
  *even for types* — the bundler resolves the module graph before type
  erasure. Shared types live in `src/lib/types.ts` (dependency-free leaf).
* **`routeTree.gen.ts` is generated** — never hand-edit; a fresh
  `npm run dev`/`build` recreates it.
* **`schema-auth.ts` is generated by better-auth** (`npm run
  auth:generate-schema`) — don't hand-edit; regenerate on plugin upgrades.
