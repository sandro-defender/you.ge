# HANDOVER — you.ge gated portfolio

**Read this first.** It records what is finished, what is broken *right now*, and
the non-obvious decisions that took research to make. Several statements here
contradict popular tutorials; each one says why and how it was verified.

---

## 0. Note for the next agent (read before touching anything)

> **Branch discipline:** work on whatever `git branch --show-current` says
> (session-bound — e.g. `arena/01a0c776-you-ge`, `arena/01a0c7a2-you-ge`);
> push only to that branch. The user's prompts sometimes name a previous
> session's branch (e.g. `01a0c71b` = PR #1, `01a0c776` = PR #2, both merged)
> — do not resurrect those; use the session branch.
>
> **Goal:** a modern gated portfolio for you.ge on **Cloudflare Workers Free +
> D1 only**: GitHub projects with descriptions, Google OAuth sign-in, per-user
> view permissions, admin panel granting access. Stack (settled, do not
> re-litigate): TanStack Start (React SSR) + Hono + better-auth 1.7.5 +
> Drizzle + D1, one Worker. Reasoning is in §2.
>
> **Hard constraints (all standing, owner-updated 2026-09-22):**
> 1. In the user's Cloudflare account, create/migrate ONLY a D1 database
>    whose name starts with the prefix **`you.ge`** (recommended:
>    `you.ge-portfolio`). Never read/modify any other remote DB. Local
>    Miniflare SQLite (`--local`) is always fine. Never run anything with
>    `--remote` against a database that fails the prefix or empty checks.
>    `scripts/d1-safety-check.mjs` enforces the prefix + empty rules and must
>    not be weakened (its `d1 execute --json` parse is deliberately
>    fail-closed — keep it that way).
> 2. Layout (owner-settled): **the project lives at the repo root** — there is
>    no `app/` folder and the old casino/games site files are removed (they
>    exist only in git history). Do not reintroduce files outside the project.
> 3. Verify APIs against the *installed packages* (node_modules, or by probing
>    at runtime), not docs/memory. better-auth 1.7.5 differs greatly from the
>    1.4.x era most tutorials describe — see §7 for traps already paid for.
> 4. The access model was **asked about and decided by the user**: a role
>    check, gate on a **`member`** role. It is implemented and E2E-verified —
>    do not redesign it (details in §3, architecture notes in §4b).
>
> **What is done:** everything under §3 "✅ Done and verified", including the
> role gate, the `/api/auth` path-prefix bugfix, `README.md`, a 20/20 green
> `scripts/role-matrix-smoke.sh`, and the R1 local-prep session (root layout,
> `you.ge` prefix safety rule, `grant-admin.mjs`, owner deploy runbook).
>
> **What is NOT done:** the remote half of R1 (owner-run runbook in README —
> this sandbox has no Cloudflare credentials), Google OAuth credentials,
> a real admin user, GitHub sync proven against a remote DB. The step-by-step
> **ROADMAP in §6** is ordered — start at R1's remainder (or R2) only when the
> previous step's acceptance criteria are met. Each Ri is sized to ~60% of one
> agent context window: do it, verify, commit, stop; leave the rest to the
> next agent.
>
> After any change: re-run §5 (tsc, build, leak check, smoke, role matrix).

---

## 1. What this is

A modern gated portfolio for you.ge, deployed as **one Cloudflare Worker**
(Workers Free + D1 only). **Layout (owner-settled 2026-09-22): the project
lives at the repo root** — this directory is the whole project. The old
Cloudflare Pages casino/games example that used to sit at the root
(`index.html`, `functions/`, `img/`, `build*.js`, …) was removed in the
R1-prep session ("chore: move project to repo root, remove legacy
casino/games site"); it survives only in git history. Do not reintroduce
files outside the project.

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
- `npx tsc --noEmit` → **0 errors**; `npx vite build` → **succeeds**
  (`dist/server/index.js` + `dist/client/`); client-bundle leak check
  **ALL_CLEAN** (§5 list).
- Local D1 migration applied (7 tables, 7 indexes). Stale-`dist` bug fixed
  long ago: `wrangler.jsonc` `main = "src/server.ts"`, never build output.
- **`README.md`** written — deploy runbook, architecture, env vars, safety.
- **R1-prep session (2026-09-22, branch `arena/01a0c7a2-you-ge`)** — what
  finished, what broke, what surprised:
  - Layout settled: `app/` moved to the repo root, legacy casino/games site
    removed (owner's standing instruction; recoverable from git history).
  - **`you.ge` prefix rule finished** in `scripts/d1-safety-check.mjs`
    (prefix `you.ge` + recommended `you.ge-portfolio`) and mirrored in
    `scripts/d1-setup.mjs` / `grant-admin.mjs` / `wrangler.jsonc` /
    `package.json`. Verified: placeholder id still blocks (exit 1), old name
    `you-ge-portfolio` and unrelated names rejected at check 1, `you.ge*`
    passes the prefix then stops at the id check. Migrate scripts now target
    the **binding** `DB` (wrangler resolves "name or binding") so they can
    never drift from `wrangler.jsonc`.
  - **What broke:** `wrangler d1 execute --json` returns a TOP-LEVEL ARRAY
    `[{results,…}]` (runtime-probed). The safety script's empty-check parse
    (`res?.results?.[0]?.results`) saw `[]` on every output and would have
    **reported a non-empty database as empty**. Fixed fail-closed
    (`d1Rows()` — unknown envelope aborts). `d1 info --json` is a bare
    `{uuid,name,…}` object (verified in wrangler 4.136.1 `cli.js`).
  - **What surprised:** the better-auth CLI's `create-admin` **cannot work**
    in this project (new §7 fact 13). Replaced by `scripts/grant-admin.mjs`
    (`npm run auth:grant-admin`) — same `user.role` UPDATE better-auth's
    setRole performs, run through `wrangler d1 execute`, prefix-checked like
    the safety script. Round-trip tested locally (grant member → revoke
    user). Remote half of R1 is an owner-run runbook (README "First deploy"):
    this sandbox has **no Cloudflare credentials** (`wrangler whoami`:
    "You are not authenticated") and the owner chose runbook-only.
- **Access model implemented** (user decision: role check / `member` role):
  - `src/lib/roles.ts` — leaf module: `ROLES`, `hasRole()` (fail-closed,
    comma-split), `PROJECT_ROLES`, `ADMIN_ROLES`.
  - `src/lib/auth-roles.ts` — `siteRoles` + `memberAc`, shared by server and
    client. **Do not pass `ac` to `admin()`** — TS2322 variance; runtime never
    reads it (uses `roles` only). See §4b.
  - `server.ts` `ACCESS_POLICY`: `/admin` requires `admin`, `/projects`
    requires `member`. Member gate 403: *"Your account has not been granted
    access yet…"* (identical page + API body).
  - `guard.ts`: `requireMember` (401 no session → 403 wrong role);
    `app.ts` mounts `requireSession, requireMember` on `/projects/*`.
  - `auth.ts` / `auth-client.ts`: both pass `roles: siteRoles` to `admin()` /
    `adminClient()` so `setRole` validates/widens to `user|member|admin`.
  - `routes/admin/users.tsx`: role select with plain-language labels +
    rewritten "How access works" copy.
- **`/api/auth/*` path-prefix bug FIXED** — Worker strips `/api` before Hono;
  `auth-routes.ts` now rebuilds the Request with `/api` restored before
  `auth.handler`. Previously **every HTTP auth endpoint 404'd** while
  `auth.api.getSession` kept working (invisible to §5 smoke). Verified:
  `/api/auth/get-session` → 200, `/api/auth/ok` → 200. **Never hand the
  stripped path to `auth.handler` again** — old comment in that file lied.
- **Role matrix E2E: 20/20 PASS** via `scripts/role-matrix-smoke.sh`
  (no-session/user/member/admin × page+API, forged-header probe).
- Local fixtures: `scripts/seed-local-test-users.mjs` (deterministic tokens,
  DELETE-then-INSERT, `--cookies` md5-stable) + 3 sessions in local D1.
- Safety tooling: `scripts/jsonc.mjs` (string-aware wrangler.jsonc parser —
  do not revert to regex `//` stripping, it ate `*/` cron + `/api/*`);
  `npm run d1:safety` exits 1 on placeholder id, zero remote calls.
- **R4 completed (2026-09-23):** UX polish pass on the gated pages:
  - **Designed 403 gate pages** (`src/server/gate-page.ts`): the Worker now
    renders branded HTML (pending/restricted/suspended) instead of
    `plainText` for member-gate, admin-gate and banned refusals. Copy kept
    byte-identical (`not been granted`, `Administrator`) so
    `role-matrix-smoke.sh` ran unchanged — 20/20. **banReason is
    HTML-escaped** (stored admin text rendered into a page every banned
    visitor loads); verified by banning a fixture with a `<script>` payload
    and grepping the response: escaped text, zero raw tags. Gate pages carry
    `noindex` + `cache-control: no-store` and inline CSS mirroring the
    app tokens (the Worker can't know Vite's hashed asset URLs).
  - **Retryable projects fetch:** `useEffect` now keys off a `reloadKey`
    counter; the error notice gained "↻ Try again" / "Back to home" buttons
    and the count badge is `role=status` + `aria-live=polite`. Skeleton and
    empty states unchanged.
  - **Card polish:** ↗ external-link affordance in the title, bottom-pinned
    meta row (`Updated {relative time}` + "View on GitHub"), flex-`gap`
    layout so the pinned row keeps breathing room, clamped descriptions kept.
  - **`?next=` guard hardened + tested:** `sanitiseNext` moved from
    `login.tsx` to leaf `src/lib/next.ts`; new `scripts/next-guard-test.mjs`
    (`npm run test:next`) — 16 unit cases against the function (Node ≥22.18
    type-strips the `.ts` import natively — no test runner added) + 6 HTTP
    probes (hostile `/login?next=…` values render 200 with no off-origin
    redirect; gated 302 preserves the encoded destination). 22/22.
  - **What broke/surprised:** playwright's CDN and storage.googleapis.com are
    blocked from this sandbox, so the first browser attempt failed — solved
    same day with `@sparticuz/chromium` (npm registry ships the binary; see
    §6 R4 status for the recipe). Screenshots at 375/1280px pixel-verified
    the grid, equal card bottoms, and gate pages. Also learned the hard way:
    **the sandbox can reset between agent turns** — node_modules, .wrangler
    (local D1) and .dev.vars were wiped mid-session; rebuild with `npm ci` →
    recreate `.dev.vars` → `db:migrate:local` → re-seed before re-running
    suites. `node scripts/next-guard-test.mjs` with a dev server down
    exits 0 with the HTTP half SKIPped unless `--strict`.
- **R5 completed (2026-09-23):** Admin UX — users + repos workflows:
  - **Last-admin guard (SERVER-side):** verified against installed
    better-auth 1.7.5 (`routes.mjs`): setRole has NO last-admin protection
    (self-demotion lockout was possible; banUser already blocks self-ban).
    The top-level `hooks: {before}` option is DEAD TYPE in 1.7.5 — the
    runtime only invokes `databaseHooks` (checked every dist .mjs). Guard
    lives on `databaseHooks.user.update.before` in `src/lib/auth.ts`: any
    role demotion FROM admin when adminCount=1 throws `APIError` 400 (covers
    both /admin/set-role and /admin/update-user; grant-admin.mjs bypasses
    hooks by design — it is the lockout recovery tool). E2E-verified: only
    admin demoting self → 400 + message; promote second admin → 200; demote
    original → 200. Client-side belt in users.tsx: non-admin options
    disabled for the last admin (their own row) + "(you)" marker.
  - **Users page:** role filter (all/user/member/admin, live counts) +
    existing search — both verified in-browser (filter=member → 1 row,
    search=plainuser → 1 row).
  - **Repos page:** ↑/↓ reorder swaps sortOrder with the rendered neighbour
    (equal values get a nudge), moves across the featured/non-featured
    boundary are DISABLED (featured pins to top by ORDER BY — impossible by
    sortOrder alone, so the buttons are honest instead of silently no-op).
    featured/hidden toggles + description edits are optimistic with
    snapshot rollback on failure (verified: toggle click → aria-checked
    flipped → PATCH persisted in DB). Custom description capped at 200
    chars — maxLength + live counter client-side, 400 server-side.
  - **Sync UX:** shared `components/SyncNowButton.tsx` (repos page + admin
    overview): POST /sync → polls /api/admin/sync-log every 2s (max ~40s)
    for a run newer than the trigger → toasts the run's REAL outcome
    (ok+repoCount+duration / error+message) via `components/Toast.tsx`
    (role=alert for errors, role=status otherwise). Overview also gained a
    recent-runs list. `apiSend` now accepts GET (for the poll).
  - **Acceptance E2E (curl):** grant member → /projects 200 → revoke → 403;
    ban → 302 (banUser deletes sessions — falls to the no-session path) →
    unban 200; self-ban 400 (better-auth); description 201 chars → 400,
    200 → 200; reorder PATCH → order changes; no new admin routes (only
    admin-router PATCH gained the cap — still behind requireAdmin).
    ⚠ Fixture trap hit here: banning a fixture user DELETES their seeded
    session row, and role-matrix-smoke.sh only regenerates cookies, not the
    SQL — re-apply `seed-local-test-users.mjs > /tmp/seed.sql | wrangler
    d1 execute --local` before re-running the matrix or the user-role rows
    fail as no-session (cost 5 red checks to learn).
  - **Bulk grant deliberately NOT built** (roadmap said ask the owner about
    expected user count first — a portfolio of a handful of invited users
    does not need it; a loop over setRole is the obvious shape if ever
    needed).
- **R3 local-only completed (2026-09-22):** GitHub sync now filters archived
  repos, upserts by stable GitHub id so renamed repos follow their row, and
  skips/logs renamed-slug conflicts instead of aborting the whole batch. It
  already omitted all curation columns from the update set; this was reviewed
  against the generated SQL path. Missing `GITHUB_TOKEN` remains a clean,
  logged unauthenticated attempt/error (60/hour behavior is surfaced from
  rate-limit headers), never a cron throw. Local migration was applied and
  `EXPLAIN QUERY PLAN` confirmed `SEARCH repos USING INDEX
  repos_visible_sort_idx`; remote tail/dashboard verification remains owner-run
  and intentionally skipped under the no-Cloudflare-interaction rule.

### ❌ Not done (→ §6 ROADMAP)

- `database_id` still placeholder (owner runs the README "First deploy"
  runbook: `d1 create you.ge-portfolio` → paste uuid → `d1:safety` →
  `db:migrate:remote` → secrets → `deploy`). No Google OAuth creds yet (R2);
  no real admin row yet (grant-admin needs the owner's first Google sign-in).
- `?next=` open-redirect guard now unit+HTTP tested (R4, 22/22), but the
  **post-Google-login round-trip** is still untested end-to-end (needs real
  Google creds, R2).
- Error-boundary route, SEO/OG tags: not started (R6/R7).

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

### 4b. Access-model implementation notes (paid research, do not undo)

Runtime facts verified against installed better-auth 1.7.5 source:

1. **`admin({ roles })` + `adminClient({ roles })`, never `ac`.** The server
   computes permissions via `options.roles || defaultRoles`; a custom `ac` is
   only consulted for `hasPermission` typing and caused TS2322 (specific
   statements vs generic `AccessControl` variance) when passed. `setRole`
   validates against `roles` → unknown role = `BAD_REQUEST INVALID_ROLE_TYPE`.
2. **`setRole` REPLACES the `role` column** (comma-joins input; revoke =
   set `"user"`). `"admin,member"` is valid. All checks `split(",")` via
   `hasRole` in `roles.ts`, which returns **false** on empty/null (fail closed).
3. **`memberAc = defaultAc.newRole({ user: [], session: [] })`** — members get
   zero admin-plugin capabilities; `hasPermission` 403s every
   `/api/auth/admin/*`. The grant's *effect* is only the role string read by
   `ACCESS_POLICY` / `requireMember`.
4. **Cookie cache 5 min** — a role change is invisible for up to 5 min on
   cookies that carry `session_data`. Cookies without `session_data` go to D1
   and see the new role immediately.
5. **Internal `x-youge-session` header** still carries `role` after the Worker
   gate; page 403 for member-on-/admin happens at `ACCESS_POLICY` before
   render. Forged values are stripped first (§4, §5).
6. **Local cookie format** (for fixtures): `better-auth.session_token` (no
   `__Secure-` prefix — `BETTER_AUTH_URL=http://localhost:3000` is not
   https), value = `token + "." + base64url(HMAC-SHA256(secret, token))`.
   `hono/dist/utils/cookie.js` is **not importable** (exports map); verify
   signatures with WebCrypto or the seed script's own signer.

## 5. Verification — re-run after every change

> **Sandbox-reset note:** a new agent turn can start with `node_modules/`,
> `.wrangler/` (local D1) and `.dev.vars` wiped (snapshot-excluded paths).
> Before running anything below: `npm ci` → recreate `.dev.vars` from
> `.dev.vars.example` (fresh `BETTER_AUTH_SECRET`) → `npm run
> db:migrate:local` → re-seed fixtures. `git` may also be behind the pushed
> session branch — `git fetch origin <branch> && git reset --hard FETCH_HEAD`
> recovers the commit without losing anything.

```bash
npx tsc --noEmit                 # expect: 0 errors
rm -rf dist && npx vite build    # expect: success (rm first: empty-dist = false-clean leak check)
npm run d1:safety                # expect: exit 1, BLOCKED on placeholder id
                                 #         (exit 0 only after a real you.ge* id is pasted)
# leak check — every line must say clean:
for n in drizzle api.github.com BETTER_AUTH_SECRET sqlite_master D1Database; do
  printf '%-22s ' "$n"; grep -rqi "$n" dist/client/ && echo FOUND || echo clean
done
# dev server (loads .dev.vars automatically), then:
npx vite dev &
node scripts/seed-local-test-users.mjs > /tmp/seed.sql
npx wrangler d1 execute DB --local --file /tmp/seed.sql   # only if fixtures missing
bash scripts/role-matrix-smoke.sh          # expect: pass=20 fail=0
npm run test:next                          # expect: pass=22 fail=0 (http half needs the dev server)
```

> `better-auth` WILL appear in `dist/client/` — that's the legitimate client
> package. What must never appear is server plumbing (the `get
> BETTER_AUTH_SECRET` accessor leaked once via `typeof import("./auth")` —
> fixed; keep `auth-client.ts` importing only `auth-roles.ts`, never `auth.ts`).

Auth-endpoint probes (regression guard for the `/api`-strip bug, §3):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/auth/get-session   # 200 (body: null)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/auth/ok            # 200
```

If these 404: someone reverted the `/api` re-prefix in
`src/server/auth-routes.ts`. **Every sign-in/OAuth/admin HTTP call is dead**
when that happens, while `auth.api.getSession` keeps working — do not be
fooled.

Baseline smoke (no cookies) — all green as of last run:

| Request | Expected |
|---|---|
| `GET /` | 200 + doctype + title + stylesheet |
| `GET /login` | 200 + "Continue with Google" |
| `GET /api/health` | 200 |
| `GET /projects`, `/projects/foo`, `/admin`, `/admin/users` | 302 → `login?next=…` |
| `GET /api/projects`, `/api/admin/repos` | 401 |
| any of the above **+ forged `x-youge-session`** | still 302/401 |

Role matrix (`scripts/role-matrix-smoke.sh`, 20 checks, last run **20/20**):

| Role | `/projects` | `/api/projects` | `/admin` | `/api/admin/repos` | get-session |
|---|---|---|---|---|---|
| no session | 302 | 401 | 302 | 401 | 200 `null` |
| `user` | **403** | **403** | 403 | 403 | 200 role=user |
| `member` | **200** | **200** | 403 | 403 | 200 role=member |
| `admin` | 200 | 200 | 200 | 200 | 200 role=admin |

The **page** 403s render as branded HTML gate pages (`src/server/gate-page.ts`)
since R4 — the script's body patterns (`not been granted`, `Administrator`)
still match because the copy is unchanged. The gate-page copy and the API 403
bodies in `guard.ts` must be changed together or neither. Ban reasons are
HTML-escaped on the way in (verified: `<script>` payload renders as text).

Open-redirect guard (`npm run test:next`, 22 checks, last run **22/22**):
unit attack-table against `src/lib/next.ts` (absolute, protocol-relative,
backslash, `javascript:`/`data:` payloads) + HTTP probes that `/login?next=…`
renders 200 without an off-origin redirect and the gated 302 preserves the
encoded same-origin destination.

Fixture credentials (local D1 only, re-seed with the script above):
`plainuser@test.local` / `memberuser@test.local` / `adminuser@test.local`,
ids `test-user-0001` / `test-member-0001` / `test-admin-0001`, tokens
`testtoken-<role>-<sha256(id)[0:24]>`, expiry +7 days.

---

## 6. ROADMAP — step-by-step, one ~60% context budget per step

Each step **R1, R2, …** is sized so a fresh agent can complete it while using
roughly **60% of one context window**: read the listed files, do the work,
verify, commit, and stop with ~40% left for review/discussion. Do **not**
bundle two steps into one session — leftovers from a blown budget are how
mistakes ship. Ordering is strict unless a step says otherwise.

**Every step ends with the same exit ritual:**
`npx tsc --noEmit` → `rm -rf dist && npx vite build` → leak check + `d1:safety`
(§5) → commit to the session branch with a message naming the R-step → push →
update §3 "Where it stands" (one paragraph: what R-step finished, what broke,
what surprised you) → stop.

---

### R1 — First production deploy (no OAuth yet)  ·  est. ~60% of budget  ·  ~90% done

*Touches:* `wrangler.jsonc`, Cloudflare dashboard, `.dev.vars`→secrets.
*Read first:* §8 (safety), README "First deploy" (the runbook), §0 constraints.

1. Owner confirmation for account commands is IN the session prompt that
   commissioned R1 ("create the you.ge* D1 DB … deploy"), constrained by the
   prefix + empty checks. The agent sandbox has **no Cloudflare credentials**
   — the owner runs the remote commands from README "First deploy" (chosen:
   runbook-only).
2. `npm run d1:setup` (read-only listing) → owner runs
   `npx wrangler d1 create you.ge-portfolio` (prefix rule!) → pastes the uuid
   into `wrangler.jsonc` `database_id`.
3. `npm run d1:safety` must now **pass** (it only ever passed-exit-0 with a
   real id + empty DB) → `npm run db:migrate:remote` (still chains the guard;
   migrates via binding `DB`).
4. `npx wrangler secret put BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
   then in R2 `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, and optionally
   `GITHUB_TOKEN` (fine-grained, read-only repo) in R3.
5. Admin bootstrap: NOT `auth create-admin` (§7 fact 13 — the CLI cannot
   reach D1 from Node). After the owner's first Google sign-in (R2) run
   `node scripts/grant-admin.mjs <owner-email>` — prefix-checked
   `user.role = 'admin'` UPDATE via `wrangler d1 execute`.
6. `npm run deploy` → hit `https://you.ge/api/health` and
   `/api/auth/get-session` (must be 200, not 404). `wrangler.jsonc` carries
   `"routes": [{ "pattern": "you.ge", "custom_domain": true }]` — if the zone
   is not in the account, deploy without it and use workers.dev meanwhile.

*Status:* local half done + runbook written (2026-09-22); remote half awaits
the owner's runbook run. *Likely time sink:* wrangler auth / account-id
confusion — ask the user rather than improvising credentials.

---

### R2 — Google OAuth end-to-end  ·  ~60%

*Touches:* Google Cloud Console (user-driven), `.dev.vars.example` docs,
possibly `auth.ts` config if callback shape surprises.
*Read first:* §5 auth probes, README "Google redirect URIs".

1. User creates an OAuth client (Web) + enables Google Identity; consents
   screen with test users = owner's email while in testing mode.
2. Redirect URIs **exactly**: `http://localhost:3000/api/auth/callback/google`
   and `https://you.ge/api/auth/callback/google`.
3. Local first: `npx vite dev` → `/login` → full Google round-trip → land on
   `/login?next=…` target → `user` role row created in local D1 → `/projects`
   shows the **403 grant message** (correct for a fresh account!).
4. Then on prod. Admin panel → `/admin/users` → or, if the R1 grant-admin ran
   before sign-up existed, run `node scripts/grant-admin.mjs <owner-email>`
   after the first sign-in; set a second test account to
   `member` → `/projects` 200; revoke back to `user` → 403.
5. Verify cookieCache lag (~5 min) is acceptable or document it in README.

*Acceptance:* real sign-in on localhost + you.ge; role matrix behaviour
identical on prod for user/member/admin; ban/unban + revoke-sessions buttons
work from `/admin/users`. *Likely time sink:* OAuth consent screen still in
"Testing" → 7-day token refresh — that's fine, document it.

---

### R3 — GitHub sync hardening + first real data  ·  ~60%

*Touches:* `src/server/github-sync.ts`, `admin-router.ts` sync endpoints,
`schema-app.ts` (only if a column is missing — add a migration then).
*Read first:* §10 quota table, §9 file map.

1. Trigger `POST /api/admin/sync` as admin; inspect `sync_log` row on
   failure (the UI shows last-run status).
2. Verify upsert SQL still excludes curation columns (§10) — flip
   `featured/hidden/customDescription` on one repo, re-sync, confirm they
   stick.
3. Edge cases: repo renamed upstream (slug conflict policy), archived repos,
   0-token 60/hr rate limit behaviour, `GITHUB_TOKEN` absent → cron must not
   hard-fail the Worker (log + sync_log, exit clean).
4. Check `repos_visible_sort_idx` is used (`EXPLAIN QUERY PLAN` in
   `wrangler d1 execute --local --command`).

*Acceptance:* owner-visible repos render on `/projects` with descriptions,
curated flags survive sync, cron `*/6h` shows a scheduled entry in
`wrangler tail` (or dashboard) without errors.

---

### R4 — UX polish pass on gated pages  ·  ~60%

*Touches:* `routes/projects.tsx`, `routes/login.tsx`, `routes/index.tsx`,
`components/Nav.tsx`, `styles/app.css`, maybe new `components/`.
*Read first:* current design tokens in `app.css`, README screenshots section.

1. Loading/empty/error states for the `useEffect` fetch (spinner, "no
   projects yet — sync pending", retry button).
2. Project card design: description clamp, language/topic chips, featured
   badge, external-link affordance; mobile pass.
3. 403 page: keep the exact member-gate copy but make it a designed state,
   not raw text (role matrix asserts the message body — update the script's
   expected string if you reword, or keep the string and restyle around it).
4. `?next=` flow: after Google login land on the originally requested page;
   open-redirect guard already in `login.tsx` — add a unit-style curl check.

*Acceptance:* role matrix still 20/20 (or updated expectations), leak check
clean, Lighthouse-ish eyeball on 375px + 1280px.

*Status:* **done (2026-09-23, visual check closed same day)** — retryable
fetch + skeleton + empty state, designed 403 gate pages, card polish (↗
affordance, "Updated …" meta row, clamped descriptions), `?next=` guard
extracted to `src/lib/next.ts` and covered by `npm run test:next` (22/22).
Copy strings kept byte-identical so the role matrix ran unchanged (20/20).
The 375/1280px eyeball initially looked impossible (playwright CDN and
storage.googleapis.com are network-blocked in the sandbox) but was completed
via the **`@sparticuz/chromium` npm package** — it ships the browser binary
inside the npm tarball (extract `bin/al2023.tar.br` libs +
`bin/fonts.tar.br`, set `LD_LIBRARY_PATH`/`FONTCONFIG_PATH`, launch with
playwright-core's `executablePath`). Pixel-verified from the screenshots:
1 column at 375px, 3 equal columns at 1280px (centered, 16px gutters), all
cards in a row share one bottom edge (grid stretch + `margin-top: auto`
meta pinning), theme colours and correct `<title>`s on every page. The
`?next=` **post-Google-login** round-trip still needs R2's real creds.

---

### R5 — Admin UX: users + repos workflows  ·  ~60%

*Touches:* `routes/admin/users.tsx`, `routes/admin/repos.tsx`,
`routes/admin/index.tsx`, `admin-router.ts` if new endpoints needed.

1. Users table: search/filter by role, show created_at, disable self-demotion
   of the last admin (better-auth may already block — verify, don't assume).
2. Bulk grant? Only if cheap (admin plugin has no bulk setRole — a small
   loop of `authClient.admin.setRole` is fine at 3 users, questionable at
   300; ask owner about expected user count first).
3. Repos table: keyboard-accessible reorder (they said drag-and-drop is nice
   but not required — verify ARIA on whatever exists), description editing
   with length cap, feature/hide toggles with optimistic UI + rollback.
4. Sync button: disabled-while-pending, toast on success/failure.

*Acceptance:* full grant→view→revoke cycle without touching SQL; no new
admin routes bypass `requireAdmin`; tsc/build/matrix green.

*Status:* **done (2026-09-23)** — all four items; bulk grant skipped
deliberately (owner question: expected user count is small; see §3 R5).
Last-admin guard is server-side (databaseHooks — the only hook surface
1.7.5 actually invokes); the top-level `hooks` option is dead type, do not
"use" it. Screenshots in this session's summary: users/repos/overview at
1280 + 375, all interactions exercised in a real browser.

---

### R6 — Security review + error handling  ·  ~60%

*Touches:* `server.ts`, `guard.ts`, `app.ts`, new `routes/error.tsx` or
`__root.tsx` errorComponent, headers config.

1. Re-read §4 forgery guard; add matrix rows for: expired session cookie,
   banned user (403 + reason), `role` containing garbage (`hasRole` fail-closed
   — unit-check `roles.ts` with node -e), `/api/auth/admin/*` as member (403).
2. Error boundary: Start's `errorComponent` — SSR errors currently fall to
   Worker 500; ship a minimal branded 500 that does not leak stack traces.
3. Headers: confirm `secureHeaders` on Hono + correct cache-control on
   `/api/health` (no-store) vs static assets (immutable).
4. Rate limiting reality-check: Workers Free has none built-in — document
   "no rate limit on /api/auth" as accepted risk or add a tiny D1 counter
   only for sign-in failures (owner decision — ask).

*Acceptance:* matrix grows to cover banned/expired (update the script's
expect table), leak check clean, no stack traces in any 500 body.

---

### R7 — SEO / meta / share cards (site becomes indexable)  ·  ~60%

*Touches:* `__root.tsx` `head()`, route heads, maybe `public/` images.

1. Only do this if the owner wants the landing page public (portfolio SEO).
   Title/description/OG/Twitter cards per route; canonical `https://you.ge`.
2. `sitemap` + `robots` via a tiny public route (no third-party deps).
3. Gated routes: `noindex` meta when 403 renders, never leak titles of
   private projects into public meta.

*Acceptance:* view-source shows correct OG tags on `/`; `/projects` 403 has
no project names in `<head>`.

---

### R8 — Owner docs + decommission prep  ·  ~60%

*Touches:* `README.md`, `HANDOVER.md` §3/§6, optional `app/docs/`.

1. Write the "owner runbook": day-2 ops (rotate secret, revoke a user, read
   sync_log, local dev from a clean clone, deploy checklist).
2. Archive this ROADMAP: mark R1–R7 done with dates; move remaining nice-to-
   haves into a backlog list.
3. Final pass: every §7 fact still true? (Re-probe the two that rot fastest:
   better-auth version, TanStack Start handler shape.)

*Acceptance:* a cold-start agent can deploy+operate from docs alone; PR
description summarises the whole arc for the owner.

---

**Out of scope unless the owner asks:** secondaryStorage/KV, Durable Objects,
multi-tab session sync, CSS frameworks, TanStack Query, i18n, non-Google
OAuth providers, Workers Paid anything.

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
   work. Bootstrap the first admin with `node scripts/grant-admin.mjs`
   (NOT the better-auth CLI — see fact 13).

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

13. **better-auth CLI's `create-admin` cannot bootstrap this project** —
    verified against the installed `auth@1.7.5` (`node_modules/auth/dist`):
    `getConfig` demands *"default export your auth instance or … a variable
    named auth"* and reads `config.options` — `src/lib/auth.ts` exports a
    `createAuth(env)` **factory**, so the CLI fails with "Couldn't read your
    auth config". Even with an instance it writes through the better-auth
    adapter = Drizzle over a **D1 binding**, which cannot exist in a Node
    process. Use `scripts/grant-admin.mjs` (wrangler-backed `user.role`
    UPDATE — what setRole does under the hood, §4b).

---

## 8. D1 safety — non-negotiable

`scripts/d1-safety-check.mjs` runs before any remote migration
(`npm run db:migrate:remote` chains it with `&&`). It refuses unless:

1. `database_name` starts with the reserved prefix **`you.ge`** (owner rule;
   recommended concrete name `you.ge-portfolio` — an unusual prefix so it
   cannot collide with an existing database), and
2. that name resolves to the configured `database_id`, and
3. the target contains **no user tables** — and the `d1 execute --json` row
   parse (`d1Rows`) is fail-closed: an unrecognised output envelope aborts
   instead of passing "empty".

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
.                              ← repo root = the whole project (owner-settled)
├── HANDOVER.md                    ← this file
├── package.json                   scripts: dev/build/deploy/db:*/d1:*/auth:*
├── wrangler.jsonc                 main=src/server.ts, D1 binding (name you.ge*),
│                                  cron */6h, you.ge custom-domain route
├── vite.config.ts                 cloudflare({viteEnvironment:{name:"ssr"}}) FIRST
├── tsconfig.json                  types: ["node","vite/client"] — NOT workers-types
├── drizzle.config.ts              dialect sqlite, no dbCredentials (correct)
├── worker-configuration.d.ts      GENERATED (604 kB) — commit it
├── .dev.vars.example              documents every secret + Google redirect URIs
├── .gitignore                     ignores .dev.vars, dist/, .wrangler/, .output/
├── README.md                      deploy runbook + architecture (§5, R1–R2)
├── scripts/
│   ├── d1-safety-check.mjs        migration guard (§8) — fail-closed row parse
│   ├── d1-setup.mjs               read-only DB listing (§8)
│   ├── grant-admin.mjs            role grant/revoke via wrangler d1 (§7.13)
│   ├── jsonc.mjs                  string-aware wrangler.jsonc parser (§3)
│   ├── seed-local-test-users.mjs  fixtures + --cookies (§5)
│   ├── role-matrix-smoke.sh       20-check E2E gate test (§5)
│   └── next-guard-test.mjs        ?next= open-redirect tests: 16 unit + 6 HTTP
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
    │   ├── roles.ts               ⭐ leaf: ROLES/hasRole fail-closed (§4b)
    │   ├── auth-roles.ts          siteRoles + memberAc, client-safe (§4b)
    │   ├── auth.ts                ⭐ createAuth(env) — admin({roles:siteRoles})
    │   ├── auth-client.ts         adminClient({roles}) + useAuthSession (§7.1)
    │   ├── internal-header.ts     leaf module, no deps (§4)
    │   ├── next.ts                sanitiseNext — ?next= guard, leaf (R4)
    │   ├── session-fn.ts          createServerFn reading that header
    │   ├── types.ts               PublicProject/AdminRepo/SyncRun (client+server)
    │   └── use-api.ts             useApi + apiSend, no TanStack Query
    ├── server/
    │   ├── app.ts                 Hono root: services → secureHeaders → routes
    │   ├── context.ts             createServices(env) — one per request
    │   ├── auth-routes.ts         ⭐ re-prefixes /api before auth.handler (§3)
    │   ├── guard.ts               requireSession, requireAdmin, requireMember
    │   ├── gate-page.ts           branded 403 gate pages, escaped (R4)
    │   ├── repos-router.ts        /projects, /projects/by-slug (indexed reads)
    │   ├── admin-router.ts        /admin/repos, PATCH (200-char desc cap), /sync, /sync-log
    │   └── github-sync.ts         ⭐ cron sync, single multi-row upsert
    ├── components/
    │   ├── Nav.tsx                session-aware nav (public routes: get-session)
    │   ├── SyncNowButton.tsx      sync + poll sync-log + result toast (R5)
    │   └── Toast.tsx              useToast + one-slot toast, a11y roles (R5)
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
