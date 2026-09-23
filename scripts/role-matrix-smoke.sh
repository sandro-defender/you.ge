#!/usr/bin/env bash
# Role-matrix smoke test for the explicit-grant access model.
# Requires: dev server on :3000, fixtures seeded (see seed-local-test-users.mjs),
# .dev.vars present. Local only — never touches a remote database.
#
# R6 additions: a node unit prelude proving hasRole() fails closed on garbage,
# and HTTP rows for expired-session / banned / garbage-role fixtures, plus the
# better-auth admin endpoint as member (its own second authorization layer).
set -u
BASE="${BASE:-http://127.0.0.1:3000}"
# Origin for POSTs to better-auth (its CSRF check rejects a missing Origin with
# 403 — without this header the row below would pass for the WRONG reason).
ORIGIN="${BASE}"
HERE="$(cd "$(dirname "$0")" && pwd)"
COOKIES=$(node "$HERE/seed-local-test-users.mjs" --cookies)
pass=0; fail=0
req() { # desc want_code pat curl_args...  — pattern is matched against body AND redirect URL
  local desc="$1" want="$2" pat="$3"; shift 3
  local code redir body ok=1
  out=$(curl -sS -o /tmp/role-m.$$ -w '%{http_code} %{redirect_url}' "$@")
  code=${out%% *}; redir=${out#* }
  body=$(head -c 100000 /tmp/role-m.$$ | tr -d '\0')
  [ "$want" = "$code" ] || ok=0
  if [ -n "$pat" ]; then printf '%s %s' "$body" "$redir" | grep -aq -- "$pat" || ok=0; fi
  if [ $ok = 1 ]; then echo "PASS  $desc ($code)"; pass=$((pass+1));
  else echo "FAIL  $desc (want=$want got=$code pat='$pat')"; fail=$((fail+1)); fi
}

# ── unit: hasRole fails closed (R6) ──────────────────────────────────────────
# Node ≥22.18 strips erasable TS natively, so the leaf module is imported
# directly — the same trick next-guard-test.mjs uses for sanitiseNext.
echo "── unit: hasRole fail-closed ──"
unit() { # desc actual want
  if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1));
  else echo "FAIL  $1 (want=$3 got=$2)"; fail=$((fail+1)); fi
}
HASROLE=$(node --input-type=module -e "
import { hasRole, PROJECT_ROLES, ADMIN_ROLES } from 'file://$HERE/../src/lib/roles.ts';
const t = (v) => JSON.stringify(v);
console.log([
  hasRole('member', PROJECT_ROLES),
  hasRole('admin', PROJECT_ROLES),          // admin implies member-level access
  hasRole('user', PROJECT_ROLES),
  hasRole('garbage', PROJECT_ROLES),        // unknown string → false
  hasRole('ADMIN', ADMIN_ROLES),            // case-sensitive → false
  hasRole(null, ADMIN_ROLES),               // missing → false
  hasRole('', ADMIN_ROLES),                 // empty → false
  hasRole('  ', ADMIN_ROLES),               // whitespace-only → false
  hasRole('admin,garbage', ADMIN_ROLES),    // comma-split: contains admin → true (documented semantics)
  hasRole('garbage,alsogarbage', ADMIN_ROLES),
].map(t).join(' '));
")
read -r U_member U_admin_implies U_user U_garbage U_case U_null U_empty U_space U_comma U_allgarbage <<< "$HASROLE"
unit "hasRole member→PROJECT_ROLES" "$U_member" true
unit "hasRole admin implies PROJECT_ROLES" "$U_admin_implies" true
unit "hasRole user→PROJECT_ROLES" "$U_user" false
unit "hasRole 'garbage'→PROJECT_ROLES (fail closed)" "$U_garbage" false
unit "hasRole 'ADMIN'→ADMIN_ROLES (case-sensitive)" "$U_case" false
unit "hasRole null→ADMIN_ROLES" "$U_null" false
unit "hasRole ''→ADMIN_ROLES" "$U_empty" false
unit "hasRole '  '→ADMIN_ROLES" "$U_space" false
unit "hasRole 'admin,garbage'→ADMIN_ROLES (comma-split, any match)" "$U_comma" true
unit "hasRole 'garbage,alsogarbage'→ADMIN_ROLES" "$U_allgarbage" false

echo "── no session ──"
req '/projects →302' 302 'login?next' "$BASE/projects"
req '/api/projects →401' 401 '' "$BASE/api/projects"
req '/admin →302' 302 'login' "$BASE/admin"
req '/api/admin/repos →401' 401 '' "$BASE/api/admin/repos"
req '/projects + FORGED header →302' 302 'login?next' -H 'x-youge-session: {"id":"x","role":"admin"}' "$BASE/projects"
while IFS='|' read -r role cookie; do
  echo "── role=$role ──"
  case "$role" in
    user)
      req 'user get-session role' 200 '"role":"user"' -H "Cookie: $cookie" "$BASE/api/auth/get-session"
      req 'user /projects →403' 403 'not been granted' -H "Cookie: $cookie" "$BASE/projects"
      req 'user /api/projects →403' 403 'not been granted' -H "Cookie: $cookie" "$BASE/api/projects"
      req 'user /admin →403' 403 'Administrator' -H "Cookie: $cookie" "$BASE/admin"
      req 'user /api/admin/repos →403' 403 '' -H "Cookie: $cookie" "$BASE/api/admin/repos"
      ;;
    member)
      req 'member get-session role' 200 '"role":"member"' -H "Cookie: $cookie" "$BASE/api/auth/get-session"
      req 'member /projects →200' 200 '<!DOCTYPE html>' -H "Cookie: $cookie" "$BASE/projects"
      req 'member /api/projects →200' 200 '"projects"' -H "Cookie: $cookie" "$BASE/api/projects"
      req 'member /admin →403' 403 'Administrator' -H "Cookie: $cookie" "$BASE/admin"
      req 'member /api/admin/repos →403' 403 '' -H "Cookie: $cookie" "$BASE/api/admin/repos"
      # better-auth's OWN admin check (second authorization layer, §4b).
      # list-users is a GET endpoint in 1.7.5 (verified in routes.mjs) — POST
      # 404s and would pass the 403 expectation for the wrong reason.
      req 'member /api/auth/admin/list-users →403' 403 '' -H "Cookie: $cookie" "$BASE/api/auth/admin/list-users"
      ;;
    admin)
      req 'admin get-session role' 200 '"role":"admin"' -H "Cookie: $cookie" "$BASE/api/auth/get-session"
      req 'admin /projects →200' 200 '<!DOCTYPE html>' -H "Cookie: $cookie" "$BASE/projects"
      req 'admin /api/projects →200' 200 '"projects"' -H "Cookie: $cookie" "$BASE/api/projects"
      req 'admin /admin →200' 200 '<!DOCTYPE html>' -H "Cookie: $cookie" "$BASE/admin"
      req 'admin /api/admin/repos →200' 200 '' -H "Cookie: $cookie" "$BASE/api/admin/repos"
      ;;
    expired)
      # Valid member role but the session row expired → must behave exactly
      # like no session at all (better-auth drops it in getSession).
      req 'expired get-session → null' 200 'null' -H "Cookie: $cookie" "$BASE/api/auth/get-session"
      req 'expired /projects →302' 302 'login?next' -H "Cookie: $cookie" "$BASE/projects"
      req 'expired /api/projects →401' 401 '' -H "Cookie: $cookie" "$BASE/api/projects"
      ;;
    banned)
      # Session technically valid, member role — the banned flag must win.
      req 'banned /projects →403 + reason' 403 'Banned by test fixture.' -H "Cookie: $cookie" "$BASE/projects"
      req 'banned /api/projects →403' 403 'Banned by test fixture.' -H "Cookie: $cookie" "$BASE/api/projects"
      req 'banned /admin →403' 403 'Banned by test fixture.' -H "Cookie: $cookie" "$BASE/admin"
      ;;
    garbage)
      # role='garbage' matches nothing — fail closed on the HTTP path too.
      req 'garbage-role /projects →403' 403 'not been granted' -H "Cookie: $cookie" "$BASE/projects"
      req 'garbage-role /api/projects →403' 403 'not been granted' -H "Cookie: $cookie" "$BASE/api/projects"
      req 'garbage-role /admin →403' 403 'Administrator' -H "Cookie: $cookie" "$BASE/admin"
      ;;
  esac
done <<< "$COOKIES"
echo; echo "ROLE MATRIX: pass=$pass fail=$fail"
rm -f /tmp/role-m.$$
[ "$fail" -eq 0 ]
