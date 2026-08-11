# PaySuite Wasp — honest status

## Verified this session

| Check | Result |
|-------|--------|
| `wasp compile` | ✅ |
| Customer portal (public query) | ✅ `get-portal-invoice` returns invoice without login |
| Portal token on invoice create | ✅ |
| API e2e + portal step | ✅ **PASSED** |
| Real password mobile login | ✅ |

E2E:

`login → customer → product → invoice → PDF → pay → stats → public portal`

## Delivered next-slice features

1. **Customer portal**
   - `Invoice.portalToken`
   - Public page `/portal/invoice/:token`
   - `getPortalInvoice` / `createPortalCheckout`
   - Staff: **Copy portal link** on invoice detail

2. **OpenSaaS noise reduced**
   - Demo AI → dashboard redirect
   - File upload page → settings
   - Admin calendar/UI demo pages → `/admin`
   - Portal routes hide main app chrome

3. **Playwright**
   - `e2e-tests/tests/paysuiteAppTests.spec.ts` (signup → dashboard → customers)
   - Landing title accepts PaySuite
   - `PLAYWRIGHT_BASE_URL` defaults to client `:3000` (not server)

## Still open (not claiming done)

- Playwright needs a running client + email verification flow may flake with Dummy provider
- Portal “Pay online” needs real Stripe keys (placeholder returns message)
- i18n/push/social, landlord CMS, S3 media, full PayPal/Razorpay webhooks

## Run

```bash
docker start paysuite-wasp-postgres
cd paysuite_wasp/app && PORT=3011 wasp start

EMAIL=you@x.com PASS=secret API_BASE=http://127.0.0.1:3011 \
  ../scripts/e2e-paysuite-api.sh

# UI e2e (client must be up)
cd e2e-tests
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/paysuiteAppTests.spec.ts
```
