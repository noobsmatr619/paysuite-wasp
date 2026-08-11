# PaySuite Wasp — honest status (do not inflate)

Last verified: compile green + server boot + mobile login returns real JSON.

## Verified working

- `wasp compile` succeeds
- Postgres migrate applied (`paysuite` DB on `:5435`)
- Server process serves **PaySuite API Server** title
- `POST /api/mobile/auth/login` → `{"message":"Invalid credentials"}` for unknown user (handler live)
- Env validation does **not** require real Stripe/S3/OpenAI keys to boot (placeholders OK)

## Implemented in this push (real code)

| Area | What |
|------|------|
| Plan limits | Enforced on create customer/product/invoice/estimate |
| RBAC | Role, RoleUser, UserInvite, permission checks, `/users` UI |
| Notifications | Model + list/mark-read |
| Plan activate | `activatePlan` creates Subscriber + BillingHistory |
| Real PDF | `pdf-lib` bytes + base64 download (`getInvoicePdf` / `getEstimatePdf`) |
| Import/export | CSV import/export customers, products; export invoices |
| Mobile API | Full CRUD-ish REST under `/api/mobile/*path` (Express 5 named wildcard) |
| Mobile app | Create invoice/expense/ticket screens + expanded client |

## Still NOT original-product parity

Do **not** treat these as done:

1. Mobile auth does **not** verify Wasp password hashes (shared password / dev rules only)
2. PayPal/Razorpay are still intent/helpers, not full PSP capture webhooks
3. No customer portal, no EN/AR i18n, no Firebase push, no social OTP
4. No media/attachments library (expenses/tickets)
5. No Laravel data migration tooling
6. Landlord CMS (testimonials/FAQ/setup) not ported
7. Invoice **edit form page** still incomplete (update API exists)
8. OpenSaaS leftover routes (demo-ai, file-upload S3) still in tree
9. PaySuite-specific e2e tests not written
10. Port collisions: use `PORT=3011` for server when 3001 busy; client may land on 3002+

## Run

```bash
# DB
docker start paysuite-wasp-postgres  # or recreate on 5435

cd paysuite_wasp/app
# .env.server already has DATABASE_URL + PORT=3011
wasp db migrate-dev
wasp start
# client may be http://localhost:3002 if 3000 busy
# API: http://localhost:3011
```

Mobile remote:

```bash
EXPO_PUBLIC_API_URL=http://YOUR_HOST:3011 npm start
# login password: paysuite-demo (MOBILE_SHARED_PASSWORD) after web signup
```
