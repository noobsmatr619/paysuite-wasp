#!/usr/bin/env bash
# PaySuite API smoke e2e (no Playwright browser).
# Usage:
#   API_BASE=http://127.0.0.1:3011 EMAIL=you@x.com PASS=secret ./scripts/e2e-paysuite-api.sh
#
# Steps: login → create customer → product → invoice → pdf → pay → stats
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3011}"
EMAIL="${EMAIL:-}"
PASS="${PASS:-}"

if [[ -z "$EMAIL" || -z "$PASS" ]]; then
  echo "Set EMAIL and PASS (Wasp signup credentials)."
  echo "Example: EMAIL=demo@paysuite.app PASS=YourPassword123 API_BASE=http://127.0.0.1:3011 $0"
  exit 1
fi

echo "== login =="
LOGIN=$(curl -sS -X POST "$API_BASE/api/mobile/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$LOGIN" | head -c 200; echo
TOKEN=$(echo "$LOGIN" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("token",""))')
if [[ -z "$TOKEN" ]]; then
  echo "LOGIN FAILED (need existing user from web signup)"
  exit 2
fi
AUTH="X-PaySuite-Token: $TOKEN"

echo "== create customer =="
CUST=$(curl -sS -X POST "$API_BASE/api/mobile/customers" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"firstName":"E2E","lastName":"Customer","email":"e2e-cust@example.com"}')
echo "$CUST" | head -c 200; echo
CID=$(echo "$CUST" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

echo "== create product =="
PROD=$(curl -sS -X POST "$API_BASE/api/mobile/products" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Service","price":100}')
echo "$PROD" | head -c 200; echo
PID=$(echo "$PROD" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

echo "== create invoice =="
INV=$(curl -sS -X POST "$API_BASE/api/mobile/invoices" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"customerId\":\"$CID\",\"lines\":[{\"productId\":\"$PID\",\"quantity\":2,\"price\":100}]}")
echo "$INV" | head -c 300; echo
IID=$(echo "$INV" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
DUE=$(echo "$INV" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("dueAmount",0))')

echo "== invoice document/pdf =="
DOC=$(curl -sS "$API_BASE/api/mobile/invoices/$IID/document" -H "$AUTH")
echo "$DOC" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("fullNumber", d.get("fullNumber"), "pdf_kb", round(len(d.get("pdfBase64") or "")/1024,1))'

echo "== pay invoice =="
PAY=$(curl -sS -X POST "$API_BASE/api/mobile/invoices/$IID/pay" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"amount\":$DUE}")
echo "$PAY" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("status", d.get("status"), "due", d.get("dueAmount"))'

echo "== stats =="
curl -sS "$API_BASE/api/mobile/statistics" -H "$AUTH" | python3 -c 'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ["customerCount","invoiceCount","totalPaid","totalDue"]})'

echo "== public portal invoice =="
# portalToken from create response if present; else skip
PTOKEN=$(echo "$INV" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("portalToken") or "")')
if [[ -n "$PTOKEN" ]]; then
  PORTAL=$(curl -sS -X POST "$API_BASE/operations/get-portal-invoice" \
    -H 'Content-Type: application/json' \
    -d "{\"json\":{\"token\":\"$PTOKEN\"}}")
  echo "$PORTAL" | python3 -c 'import sys,json; d=json.load(sys.stdin).get("json",{}); print("portal", d.get("invoiceFullNumber"), "due", d.get("dueAmount"), "company", d.get("companyName"))'
else
  echo "no portalToken on invoice (older server?)"
fi

echo
echo "E2E API SMOKE PASSED"
