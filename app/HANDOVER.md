# HANDOVER — you.ge gated portfolio

**Read this first.** It records what is finished, what is broken *right now*, and
the non-obvious decisions that took research to make. Several statements here
contradict popular tutorials; each one says why and how it was verified.

---

## 0. Prompt for the next agent

> You are continuing work in `/home/user/you.ge` on branch `arena/01a0c71b-you-ge`.
> Read `app/HANDOVER.md` completely before changing anything — it lists verified
> API facts that contradict common tutorials, and one bug that is mid-fix.
>
> The goal: a modern gated portfolio for you.ge on **Cloudflare Workers Free +
> D1 only**, showing the owner's GitHub projects, with Google OAuth sign-in,
> per-user permissions, and an admin panel to grant access.
>
> Stack (already scaffolded in `app/`, building and typechecking clean):
> TanStack Start (React SSR) + Hono (API) + better-auth (Google OAuth, RBAC,
> admin plugin) + Drizzle ORM + D1, deployed as one Worker.
>
> **Hard constraints:**
> 1. Never touch, create, migrate, or read any D1 database in the user's
>    Cloudflare account. Local Miniflare SQLite (`--local`) is fine and is the
>    only database that currently exists. `scripts/d1-safety-check.mjs` enforces
>    this — do not weaken it, and do not run anything with `--remote`.
> 2. Do not modify anything outside `app/`. The casino/games files at the repo
>    root are the user's previous example site and must stay untouched.
> 3. Verify APIs against the *installed packages* (node_modules, or by probing at
>    runtime), not against docs or memory. better-auth is at 1.7.5 and its API
>    has moved significantly from the 1.4.x era most tutorials describe.
>
> Immediate job: finish section 3 ("Where it stands"), then section 6 ("Next
> steps"). Re-run the smoke tests in section 5 after any change.

---

## 1. What this is

The repo root is the user's **existing** Cloudflare Pages site (a casino/games
example: `index.html`, `games/`, `functions/`). The user said those are all
examples. Everything new lives in **`app/`**, a self-contained Worker project.

Nothing outside `app/` has been modified — `git diff --stat HEAD` is empty and
`git status` shows only `?? app/`.

Requirements, verbatim from the user:

- modern-looking page
- GitHub project links + descriptions
- user system with permissions to view pages
- Google auth
- admin panel to grant access to users
- Cloudflare **free** hosting, **D1 only**, Workers

---

## 2. Why this stack (the reasoning, so it isn't re-litigated)

| Decision | Why |
|---|---|
| **Workers, not Pages** | Cron triggers are Workers-only (Pages cannot do them). Static asset requests on Workers are free/unlimited and do **not** count toward the 100k requests/day free allowance. Pages is in maintenance mode; new features ship to Workers first. |
| **TanStack Start, not React Router v8 / Next.js** | Officially supported by `@cloudflare/vite-plugin` with a current CF guide. React Router v8 has open plugin bugs (dual-package hazard, Vite 8 build failure, stale D1 schema in dev). Next.js needs a third-party adapter. |
| **React SSR, not a SPA** | The requirement is *permissions to view a page*. A client-side guard ships the gated bundle to the browser first. SSR lets the server return 302/403 before rendering anything. |
| **Hono for `/api/*`** | Better-auth needs raw HTTP endpoints at exact URLs (Google redirects the browser straight to `/api/auth/callback/google`), which RPC-style server functions cannot provide. |
| **better-auth** | Its admin plugin already implements list-users / set-role / ban / unban / revoke-sessions. Hand-rolling that is the ~200h its own docs estimate. |
| **Cron → D1 for GitHub data** | GitHub allows **60 unauthenticated requests/hour/IP**, 5,000/hour with a PAT. Fetching repos per page view would break the site within an hour of traffic. Scheduled invocations are free and don't count toward the request allowance. |
| **No CSS framework** | Plain custom properties in `src/styles/app.css`. One less dependency to keep compatible with Vite 8. |
| **No TanStack Query** | Two admin tables don't justify a provider + cache + bundle weight. `src/lib/use-api.ts` is ~60 lines and handles unmount cancellation. |

### D1 free-tier facts that shaped the design

- 5 GB storage, **5M rows read/day**, **100k rows written/day**.
- "Rows read" = rows **scanned**, not rows returned. Indexes are a quota control, not just a perf nicety.
- **Since 2026-09-01 exceeding a daily cap HARD FAILS every query** until 00:00 UTC. It does not degrade. Your site goes down.
- Bundle limit is now 64 MiB uncompressed on Free and Paid (raised 2026-09-04).

---

## 3. Where it stands

### ✅ Done and verified

- All config, schema, server code, routes and components written.
- `npx tsc --noEmit` → **0 errors**.
- `npx vite build` → **succeeds**, outputs `dist/server/index.js` + `dist/client/`.
- Local D1 migration applied: 7 tables, 7 indexes (`repos_visible_sort_idx`, `repos_slug_idx`, `session_userId_idx`, …).
- **Security smoke tests passed** (see §5).
- Client bundle is 429 kB; no drizzle, no SQL, no GitHub URL, no D1 types in it.

### ⚠️ IN PROGRESS — the one thing to finish first

`vite dev` was serving a **stale `dist/server/index.js`** instead of compiling
`src/`, so a bug I had already fixed kept throwing:

```
TypeError: useSession is not a function
    at Nav (dist/server/assets/router-w5-cfLmR-B-48jkM2.js:1588:39)
```

Root cause: I had set `wrangler.jsonc` `"main": "dist/server/index.js"`.
**Already fixed** — `main` is now `"src/server.ts"` and the top-level `assets`
block was removed. `dist/` was deleted.

**Not yet re-verified.** Do this first:

```bash
cd app
npx vite dev            # or: npm run dev  (background it)
# then re-run every test in §5
```

Expected: `/` and `/login` return **HTTP 200 with real server-rendered HTML**
(previously `/` returned 500 because of the stale bundle).

### ❌ Not done

- `app/README.md` does not exist.
- Never deployed. `database_id` is still the placeholder.
- No Google OAuth credentials configured.
- No admin user created.
- `worker-configuration.d.ts` should be regenerated (`npx wrangler types`) since
  `wrangler.jsonc` changed after the last generation.

---

## 4. Architecture — the part that took research

```
                        ┌─────────────────────────────────────┐
   request ───────────▶ │  src/server.ts   (Worker entry)     │
                        │                                     │
                        │  1. strip x-youge-session header    │  ← forgery guard
                        │  2. /api/*  ────────▶ Hono          │
                        │  3. ACCESS_POLICY match?            │
                        │       ├─ validate session (D1)      │
                        │       ├─ banned?      → 403         │
                        │       ├─ admin-only?  → 403         │
                        │       └─ ok → inject header, render │
                        │  4. else → TanStack Start renders   │
                        │                                     │
                        │  scheduled() ──▶ GitHub → D1        │  ← free, cron
                        └─────────────────────────────────────┘
```

### Why the permission check lives in the Worker entry and nowhere else

Two hard constraints, both verified against the installed packages:

1. Start's handler is typed `RequestHandler = (request, options?) => Response`.
   **It never receives `env`**, so no route loader or server function can reach
   the D1 binding. Passing 3 args is a type error (TS2554) — I hit it.
2. `cloudflare:workers` in this dependency set exports only `RpcStub`,
   `RpcTarget`, `WorkerEntrypoint`, `DurableObject`. **There is no
   `getCloudflareContext()`** to recover `env` from async context.

`fetch(request, env, ctx)` is therefore the **only** place holding both the
request and the database. Gating happens there, before React runs.

### How the session reaches React without a second DB read

`src/server.ts` validates the session once, then forwards a projection
(id/name/email/image/role) on the internal header `x-youge-session`.
`src/lib/session-fn.ts` (a `createServerFn`) reads that header via
`getRequestHeaders()`.

The header name lives in **`src/lib/internal-header.ts`**, a dependency-free leaf
module. Both the server entry and the client-reachable server fn import it from
there — importing it from `src/server.ts` would pull Hono + better-auth + Drizzle
into the browser bundle.

**Forgery guard:** `stripInternalHeaders()` deletes that header from every
inbound request before anything else, and it is only ever re-added post-
validation. Tested — see §5.

### Why the projects page fetches in `useEffect`, not in `loader`

A route `loader` runs on the server during SSR. If it fetched `/api/projects`,
the Worker would make an HTTP request **to itself**, which deadlocks the isolate.
So: loader reads the session from the internal header (memory, no I/O); the
project list is fetched client-side after hydration, where `/api/projects` is a
normal same-origin browser request.

---

## 5. Verification already performed — re-run after changes

```bash
cd app
npx tsc --noEmit                                    # expect: 0 errors
npx vite build                                      # expect: success
npm run d1:safety                                   # expect: exit 1, BLOCKED
npx wrangler d1 migrations apply you-ge-portfolio --local
npx vite dev &
```

Security smoke tests (all passed at the time of writing):

| Request (no cookie) | Expected | Got |
|---|---|---|
| `GET /api/health` | 200 | **200** ✔ |
| `GET /projects` | 302 → `/login?next=%2Fprojects` | **302** ✔ |
| `GET /projects/foo` | 302, next preserved | **302** ✔ |
| `GET /admin` | 302 | **302** ✔ |
| `GET /admin/users` | 302 | **302** ✔ |
| `GET /api/projects` | 401 | **401** ✔ |
| `GET /api/admin/repos` | 401 | **401** ✔ |
| `GET /projects` **with forged `x-youge-session: {"role":"admin",…}`** | 302, not 200 | **302** ✔ |

Still to re-verify after the `main` fix:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/          # want 200 (was 500)
curl -s http://127.0.0.1:3000/login | grep -o 'Continue with Google'      # want a match
```

Client-bundle leak check (must all say `clean`):

```bash
npx vite build
for n in drizzle api.github.com BETTER_AUTH_SECRET sqlite_master D1Database; do
  printf '%-22s ' "$n"; grep -rqi "$n" dist/client/ && echo '⚠ FOUND' || echo clean
done
```

> Note: `better-auth` *will* appear in `dist/client/` — that is legitimate, it's
> the `better-auth/client` package. What must NOT appear is server config
> plumbing. An earlier version leaked better-auth's `env` accessor
> (`get BETTER_AUTH_SECRET(){…}`) because `auth-client.ts` inferred a type via
> `typeof import("./auth")`. Fixed; keep it that way.

---

## 6. Next steps, in order

1. **Restart dev and re-run §5.** Confirm `/` is 200 with real HTML.
2. **Regenerate types**: `npx wrangler types` (wrangler.jsonc changed).
3. **Write `app/README.md`** — see §7 for everything it must contain.
4. **Decide the access model** (currently a deliberate placeholder):
   `ACCESS_POLICY` in `src/server.ts` makes `/projects` require only a *session*,
   so **anyone who signs in with Google can view projects**. The user asked for
   "permissions to view page" + "admin grants access", which implies an explicit
   grant. To implement: add a role check (e.g. `requires: "member"`) or an
   `access_granted` column, and seed the first admin with
   `npm run auth:create-admin`. **Ask the user which they want.**
5. **First real deploy** (user must do this — needs their Cloudflare account):
   ```bash
   npm run d1:setup                                   # read-only: lists existing DBs
   npx wrangler d1 create you-ge-portfolio            # NEW database
   # paste the uuid into wrangler.jsonc database_id
   npm run d1:safety                                  # must pass now
   npm run db:migrate:remote
   npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GITHUB_TOKEN
   npm run auth:create-admin
   npm run deploy
   ```
6. **Google Cloud Console**: OAuth client → Web application. Authorized redirect
   URIs must be **exactly**:
   `http://localhost:3000/api/auth/callback/google` and
   `https://you.ge/api/auth/callback/google`. A mismatch fails *every* sign-in
   and the cause is invisible from the browser.
7. Nice-to-haves: `?next=` post-login redirect is implemented but untested
   end-to-end (needs real Google creds); error boundary route; SEO/OG tags if the
   site ever becomes public.

---

## 7. Facts that contradict tutorials — do not "fix" these

Each was verified against the installed packages, not memory.

1. **`authClient.useSession` is NOT a React hook in better-auth 1.7.5.** It is a
   nanostores Atom (`eq/get/init/lc/listen/notify/off/set/subscribe/value/
   events`). Calling it throws `TypeError: useSession is not a function` and
   fails typecheck with TS2349. Use `useAuthSession()` from
   `src/lib/auth-client.ts`, which wraps the plain `getSession()` function.
   Most better-auth tutorials online are written for 1.4.x and are wrong here.

2. **TanStack Start 1.168 has no `server: { handlers: {} }` route option** and
   does not export `createServerRoute`. The pattern in several blog posts does
   not exist in this version. Verified: `createFileRoute` has no `server` key and
   no package under `node_modules/@tanstack` contains `createServerRoute`.

3. **The router entry must be `src/router.tsx` and must export `getRouter`.**
   `required: true` in the plugin's entry plan, resolved relative to `src/`.
   Naming it anything else (e.g. `createAppRouter`) fails the build with
   `MISSING_EXPORT: "getRouter" is not exported by "src/router.tsx"`.

4. **better-auth has no `d1Adapter()`.** You must use
   `drizzleAdapter(db, { provider: "sqlite" })`.

5. **The admin plugin has TWO authorization layers** — your middleware *and* its
   internal DB check `user.role === "admin"`. Granting admin only via an env
   allowlist yields 403 on every `/api/auth/admin/*` call while your own routes
   work. Bootstrap with `npm run auth:create-admin`.

6. **Do not use `secondaryStorage` (KV) for sessions.** better-auth checks it
   *before* the DB and short-circuits on a hit, so a KV-backed session is served
   from a stale colo after revocation. Sessions live in D1 only.

7. **No Durable Objects** — they require Workers Paid. Multi-tab session sync
   would need `BroadcastChannel` + polling, and polling is a quota hazard
   (50 tabs × 30s = 144k requests/day). Not implemented; not needed yet.

8. **`@cloudflare/workers-types` must NOT be in tsconfig `types`.** `wrangler
   types` generates `worker-configuration.d.ts` including runtime types and says
   so explicitly. Listing both produces duplicate globals. `@types/node` IS
   required because `nodejs_compat` is enabled.

9. **`wrangler.jsonc` `main` must be `src/server.ts`**, not build output. See §3.

10. **`Env` must extend the generated `Cloudflare.Env`.** With `--strict-vars`
    (default), wrangler types `vars` as *string literals*
    (`GITHUB_USERNAME: "sandro-defender"`). A hand-written structural `Env` with
    `string | undefined` is mutually unassignable with it → TS2345. Fixed in
    `src/lib/env.ts` as `Cloudflare.Env & Secrets`.

11. **`migrations_dir: "drizzle"`** must be set on the D1 binding. Wrangler
    defaults to `./migrations`; drizzle-kit writes to `./drizzle`. Without this,
    `migrations apply` reports "no migrations to apply" and looks like success
    while leaving every query failing with `no such table`.

12. **`startHandler.fetch(request)` takes 1 arg**, not the Worker triple.

---

## 8. D1 safety — non-negotiable

`scripts/d1-safety-check.mjs` runs before any remote migration
(`npm run db:migrate:remote` chains it with `&&`). It refuses unless:

1. `database_name === "you-ge-portfolio"` (a deliberately unusual name so it
   cannot collide with an existing database), and
2. that name resolves to the configured `database_id`, and
3. the target contains **no user tables**.

Why it exists: `wrangler d1 migrations apply --remote` records applied migrations
in the target's `d1_migrations` table. Point it at a database you already use and
that table has no record of *our* migrations — so wrangler replays all of them
against live data.

Tested: placeholder id → exit 1; wrong db name → exit 1. Override flag
(`--allow-non-empty`) exists and is intentionally ugly.

`scripts/d1-setup.mjs` is **read-only**: it lists the account's existing
databases, marks them `DO NOT TOUCH`, and prints the `d1 create` command for a
human to run. No script in this repo creates or migrates a database on its own.

---

## 9. File map

```
app/
├── HANDOVER.md                    ← this file
├── package.json                   scripts: dev/build/deploy/db:*/d1:*/auth:*
├── wrangler.jsonc                 main=src/server.ts, D1 binding, cron */6h
├── vite.config.ts                 cloudflare({viteEnvironment:{name:"ssr"}}) FIRST
├── tsconfig.json                  types: ["node","vite/client"] — NOT workers-types
├── drizzle.config.ts              dialect sqlite, no dbCredentials (correct)
├── worker-configuration.d.ts      GENERATED (604 kB) — commit it
├── .dev.vars.example              documents every secret + Google redirect URIs
├── .gitignore                     ignores .dev.vars, dist/, .wrangler/, .output/
├── scripts/
│   ├── d1-safety-check.mjs        migration guard (§8)
│   └── d1-setup.mjs               read-only DB listing (§8)
├── drizzle/
│   └── 0000_volatile_thena.sql    6 tables + indexes
└── src/
    ├── server.ts                  ⭐ Worker entry: gating + /api routing + cron
    ├── router.tsx                 must export getRouter (§7.3)
    ├── routeTree.gen.ts           GENERATED from src/routes/
    ├── styles/app.css             design tokens, dark theme, no framework
    ├── db/
    │   ├── schema.ts              barrel
    │   ├── schema-auth.ts         GENERATED by better-auth — don't hand-edit
    │   └── schema-app.ts          repos + sync_log, curated columns
    ├── lib/
    │   ├── env.ts                 Env = Cloudflare.Env & Secrets
    │   ├── db.ts                  createDb(d1)
    │   ├── auth.ts                ⭐ createAuth(env) factory — per request
    │   ├── auth-client.ts         browser client + useAuthSession() (§7.1)
    │   ├── internal-header.ts     leaf module, no deps (§4)
    │   ├── session-fn.ts          createServerFn reading that header
    │   ├── types.ts               PublicProject/AdminRepo/SyncRun (client+server)
    │   └── use-api.ts             useApi + apiSend, no TanStack Query
    ├── server/
    │   ├── app.ts                 Hono root: services → secureHeaders → routes
    │   ├── context.ts             createServices(env) — one per request
    │   ├── auth-routes.ts         sub.all("/*") → auth.handler(raw)
    │   ├── guard.ts               requireSession, requireAdmin
    │   ├── repos-router.ts        /projects, /projects/by-slug (indexed reads)
    │   ├── admin-router.ts        /admin/repos, PATCH, /sync, /sync-log
    │   └── github-sync.ts         ⭐ cron sync, single multi-row upsert
    ├── components/Nav.tsx
    └── routes/
        ├── __root.tsx             head(): meta + ?url CSS link
        ├── index.tsx              public landing
        ├── login.tsx              Google sign-in, sanitised ?next= (open-redirect guard)
        ├── projects.tsx           gated; useEffect fetch (§4)
        ├── $.tsx                  404 splat
        └── admin/
            ├── route.tsx          layout + tabs
            ├── index.tsx          overview + sync status
            ├── users.tsx          ⭐ grant/revoke access via authClient.admin.*
            └── repos.tsx          feature/hide/reorder/custom description
```

---

## 10. Quota model (Workers Free)

| Thing | Cost | Notes |
|---|---|---|
| Static assets (JS/CSS/img) | **free, unlimited** | does not count toward 100k req/day |
| SSR page view | 1 Worker request | 100k/day budget |
| Session check | ~0 D1 rows | served from better-auth `cookieCache` (5 min) |
| Session cache miss | ~3 D1 rows read | 5M/day budget → ~5k views/day ≈ 0.3% |
| Cron sync | **free** | scheduled invocations don't count |
| Cron sync writes | ~1 row/repo + 1 log | 100 repos × 4/day ≈ 400 of 100k writes |

The two ways to blow this up, both avoided by design:
- polling the session endpoint on an interval (never add `refetchInterval`);
- an unindexed query (all lookups use `repos_visible_sort_idx` / `repos_slug_idx`).

`github-sync.ts` upserts in **one** multi-row statement, verified to emit:
```sql
insert into "repos" (…) values (?,…), (?,…) on conflict ("repos"."slug")
do update set … where …
```
The `set` list deliberately **excludes** `featured`, `hidden`, `sortOrder` and
`customDescription`, so admin curation survives every sync forever.
