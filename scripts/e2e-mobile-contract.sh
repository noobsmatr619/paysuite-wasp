#!/usr/bin/env bash
# Verifies every endpoint paysuite_full_mobile depends on actually answers.
#
# Bundling and tsc pass whether or not the API agrees with the client, so
# neither says anything about whether the app can talk to the server. This
# walks the paths the client ships and calls each against a running server.
#
#   cd app && PORT=3011 wasp start
#   MOBILE_SRC=../paysuite_full_mobile bash scripts/e2e-mobile-contract.sh
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3011/api/mobile}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3011}"
MOBILE_SRC="${MOBILE_SRC:-../paysuite_full_mobile}"
EMAIL="${E2E_EMAIL:-}"
PASSWORD="${E2E_PASSWORD:-Password123!}"

pass=0
fail=0
ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1 — $2"; fail=$((fail + 1)); }

echo "Mobile contract check against $API_BASE"

# A dev client on the same port answers 200 with HTML and looks healthy.
ct=$(curl -s -o /dev/null -w "%{content_type}" "$AUTH_BASE/auth/me")
case "$ct" in
  application/json*) ok "server is the API (content-type $ct)" ;;
  *) bad "content-type" "expected JSON, got '$ct' — a Vite client may hold this port"
     echo "Results: $pass passed, $fail failed"; exit 1 ;;
esac

# Register a throwaway tenant owner so the run needs no seeded credentials.
if [[ -z "$EMAIL" ]]; then
  EMAIL="e2e.contract.$(date +%s)@paysuite.test"
  curl -s -o /dev/null -X POST "$AUTH_BASE/api/mobile/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"E2E\",\"lastName\":\"Contract\"}"
fi

TOKEN=$(curl -s -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" |
  python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[[ -n "$TOKEN" ]] && ok "login" || { bad "login" "no token for $EMAIL"; echo "Results: $pass passed, $fail failed"; exit 1; }

# The mobile API authenticates with X-PaySuite-Token, not Authorization: Bearer.
# The client does this deliberately — Wasp's session middleware intercepts a
# Bearer header — so sending Bearer here 401s on every route and looks like a
# broken API.
AUTH_HEADER="X-PaySuite-Token: $TOKEN"

# Routes that only accept a write, and routes that would end the run.
# Note PaySuite marks notifications read with POST; the HRM app uses PATCH for
# the same idea, so do not assume one from the other.
POST_ONLY="plan-buy account-delete-request change-password user-invite read-all-notifications"
PATCH_ONLY=""
SKIP="auth/ change-password account-delete-request"

matches() { [[ -z "$2" ]] && return 1; for p in $2; do [[ "$1" == *"$p"* ]] && return 0; done; return 1; }

while read -r ep; do
  [[ -z "$ep" ]] && continue
  # Skip templated paths; those need a live id.
  case "$ep" in *'$'*|*'{'*|*:*) continue ;; esac
  matches "$ep" "$SKIP" && continue

  if matches "$ep" "$PATCH_ONLY"; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH -H "$AUTH_HEADER" \
      -H 'Content-Type: application/json' -d '{}' "$API_BASE/$ep")
    [[ "$code" == "200" ]] && ok "PATCH /$ep (200)" || bad "PATCH /$ep" "HTTP $code"
  elif matches "$ep" "$POST_ONLY"; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "$AUTH_HEADER" \
      -H 'Content-Type: application/json' -d '{}' "$API_BASE/$ep")
    # A validation error still proves the route exists and is wired.
    [[ "$code" == "200" || "$code" == "400" || "$code" == "422" ]] \
      && ok "POST /$ep ($code)" || bad "POST /$ep" "HTTP $code"
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API_BASE/$ep")
    [[ "$code" == "200" ]] && ok "GET /$ep (200)" || bad "GET /$ep" "HTTP $code"
  fi
done < <(grep -oE 'remote[<(][^"]*"[a-z0-9/{}$-]+"' "$MOBILE_SRC/src/api/client.ts" |
         grep -oE '"[a-z0-9/{}$-]+"' | tr -d '"' | sort -u)

echo
echo "Results: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]] && echo "MOBILE CONTRACT OK" || exit 1
