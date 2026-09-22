#!/usr/bin/env bash
# Role-matrix smoke test for the explicit-grant access model.
# Requires: dev server on :3000, fixtures seeded (see seed-local-test-users.mjs),
# .dev.vars present. Local only — never touches a remote database.
set -u
BASE="${BASE:-http://127.0.0.1:3000}"
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
      ;;
    admin)
      req 'admin get-session role' 200 '"role":"admin"' -H "Cookie: $cookie" "$BASE/api/auth/get-session"
      req 'admin /projects →200' 200 '<!DOCTYPE html>' -H "Cookie: $cookie" "$BASE/projects"
      req 'admin /api/projects →200' 200 '"projects"' -H "Cookie: $cookie" "$BASE/api/projects"
      req 'admin /admin →200' 200 '<!DOCTYPE html>' -H "Cookie: $cookie" "$BASE/admin"
      req 'admin /api/admin/repos →200' 200 '' -H "Cookie: $cookie" "$BASE/api/admin/repos"
      ;;
  esac
done <<< "$COOKIES"
echo; echo "ROLE MATRIX: pass=$pass fail=$fail"
rm -f /tmp/role-m.$$
[ "$fail" -eq 0 ]
