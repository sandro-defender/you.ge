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

---

## Quick start

```bash
cd app
npm ci
npx wrangler d1 migrations apply you-ge-portfolio --local   # local Miniflare SQLite only
npx vite dev                                                # http://localhost:3000
```

Copy `.dev.vars.example` → `.dev.vars` and fill in the secrets before sign-in
can work (see [Secrets](#secrets) and [Google OAuth](#google-oauth)).

Other everyday commands:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (serves `src/server.ts` through the Cloudflare plugin) |
| `npm run build` | Production build → `dist/server/` (Worker) + `dist/client/` (assets) |
| `npm run preview` | Preview the built worker locally |
| `npm run typecheck` | `tsc --noEmit` — must stay at 0 errors |
| `npm run d1:safety` | D1 migration guard (see [D1 safety](#d1-safety)) — **expect exit 1 while `database_id` is a placeholder** |
| `npm run d1:setup` | Read-only listing of D1 databases in the account (never creates anything) |
| `npm run db:migrate:local` | Apply `drizzle/` migrations to the **local** Miniflare DB |
| `npm run db:generate` | Generate a migration from schema changes (drizzle-kit) |
| `npm run db:studio` | Drizzle Studio (local DB) |
| `npm run auth:create-admin` | Bootstrap the first `role = "admin"` user (better-auth CLI) |
| `npm run auth:info` | Print better-auth runtime info |
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
| `admin` | `npm run auth:create-admin` | everything member can + `/admin*` |

Enforced in **two places that must agree**: `ACCESS_POLICY` in `src/server.ts`
(pages) and `requireMember`/`requireAdmin` in `src/server/guard.ts` (API).
The same `siteRoles` map is passed to `admin({ roles })` (server — validates
setRole submissions, drives `hasPermission`) and `adminClient({ roles })`
(client — widens `setRole` types to include `member`). Verify with
`scripts/role-matrix-smoke.sh` (20 checks: no-session, user, member, admin).

---

## D1 safety — non-negotiable

**Never create, read, migrate, or touch any D1 database in the Cloudflare
account except this project's own brand-new `you-ge-portfolio`. Local
Miniflare SQLite (`--local`) is fine. Never run anything with `--remote`
yourself.**

* `scripts/d1-safety-check.mjs` runs automatically before
  `npm run db:migrate:remote` and refuses unless:
  1. `database_name === "you-ge-portfolio"` (deliberately unusual, cannot
     collide with an existing DB),
  2. that name resolves to the configured `database_id`,
  3. the target has **no user tables**.
* Its JSONC parsing uses `scripts/jsonc.mjs` — a **string-aware scanner**.
  Do not “simplify” it back to regexes: `wrangler.jsonc` contains `/api/*`
  inside a `//` comment and the cron `"0 */6 * * *"` inside a string, and a
  block-comment-before-line-comment regex silently deletes `main`,
  `d1_databases` and `triggers` before any guard runs (this exact bug was
  found and fixed; see `git log` for `jsonc.mjs`).
* `scripts/d1-setup.mjs` is **read-only**: it runs `wrangler d1 list` and
  prints the `d1 create` command for a human to run. No script in this repo
  creates or migrates a database on its own.
* Workers Free D1 caps (since 2026-09-01, exceeding a daily cap **hard-fails
  every query** until 00:00 UTC): 5M rows **scanned**/day, 100k rows
  written/day, 5 GB storage. Indexes are quota control, not just perf.

---

## First deploy (owner-run — needs the real Cloudflare account)

```bash
npm run d1:setup                                   # read-only: lists existing DBs
npx wrangler d1 create you-ge-portfolio            # NEW database
# paste the printed uuid into wrangler.jsonc "database_id"
npm run d1:safety                                  # must pass now (no longer exit 1)
npm run db:migrate:remote                          # chains the safety check first
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_TOKEN                # optional; sync degrades without it
npm run auth:create-admin
npm run deploy
```

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
   routes work. Bootstrap with `npm run auth:create-admin`.

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
app/
├── HANDOVER.md                 ← full handover: state, architecture, research notes
├── README.md                   ← this file
├── package.json                scripts (see Quick start)
├── wrangler.jsonc              main=src/server.ts, D1 binding, cron */6h, vars
├── vite.config.ts              cloudflare() FIRST, then tanstackStart(), react(),
│                               then the client-only better-auth env stub plugin
├── tsconfig.json               types: ["node","vite/client"] — NOT workers-types
├── drizzle.config.ts           dialect sqlite, no dbCredentials (correct)
├── worker-configuration.d.ts   GENERATED by `npm run cf-typegen` — commit it
├── .dev.vars.example           every secret + Google redirect URIs documented
├── scripts/
│   ├── d1-safety-check.mjs     migration guard (runs before any --remote)
│   ├── d1-setup.mjs            read-only DB listing
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
    │   ├── session-fn.ts       createServerFn reading the internal header
    │   ├── types.ts            PublicProject/AdminRepo/SyncRun (client+server)
    │   └── use-api.ts          useApi + apiSend, no TanStack Query
    ├── server/
    │   ├── app.ts              Hono root: services → secureHeaders → routes
    │   ├── context.ts          createServices(env) — one per request
    │   ├── auth-routes.ts      sub.all("/*") → auth.handler(raw)
    │   ├── guard.ts            requireSession, requireAdmin
    │   ├── repos-router.ts     /projects, /projects/by-slug (indexed reads)
    │   ├── admin-router.ts     /admin/repos CRUD + /sync + /sync-log
    │   └── github-sync.ts      ⭐ cron sync, single multi-row upsert
    ├── components/Nav.tsx
    └── routes/
        ├── __root.tsx          ⭐ document shell + head() (fact #13)
        ├── index.tsx           public landing
        ├── login.tsx           Google sign-in, sanitised ?next= (open-redirect guard)
        ├── projects.tsx        gated; useEffect fetch (HANDOVER §4)
        ├── $.tsx               404 splat
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
