# PaySuite Wasp — honest status

## Verified (this session)

| Check | Result |
|-------|--------|
| `wasp compile` | ✅ green |
| DB migrate | ✅ including Attachment |
| Server boot | ✅ `PORT=3011` |
| Web signup | ✅ `POST /auth/email/signup` |
| Mobile login (real password hash) | ✅ Argon2 via Wasp `verifyPassword` |
| E2E API smoke | ✅ `scripts/e2e-paysuite-api.sh` **PASSED** |

E2E path proved:

`login → create customer → product → invoice → PDF base64 → pay → stats`

Use header: **`X-PaySuite-Token: <jwt>`** (not `Authorization: Bearer` — Wasp session layer intercepts that).

## Done this round

1. **Real mobile password auth** (`verifyCredentials.ts` + Wasp AuthIdentity)
2. **Invoice + estimate edit pages** (`/invoices/:id/edit`, `/estimates/:id/edit`)
3. **Attachments** (DB base64, UI on invoice/ticket/expense)
4. **E2E script** `scripts/e2e-paysuite-api.sh`
5. **Demo AI app** redirects to `/dashboard`

## Still not original-product 100%

- EN/AR i18n, OTP, social login, Firebase push  
- Customer portal / public payment page  
- PayPal/Razorpay full capture webhooks  
- Landlord CMS (landing sections admin)  
- S3 media (attachments are local DB only, size capped)  
- Playwright browser e2e for full UI  
- OpenSaaS code still present (file-upload/S3, payment processors unused) but demo route neutralized  

## Run

```bash
docker start paysuite-wasp-postgres
cd paysuite_wasp/app
PORT=3011 wasp start

# after signup at http://localhost:3000 (or next free port)
EMAIL=you@x.com PASS=YourPassword \
API_BASE=http://127.0.0.1:3011 \
  ../scripts/e2e-paysuite-api.sh
```

Mobile:

```bash
EXPO_PUBLIC_API_URL=http://HOST:3011 npm start
# same email/password as web signup
```
