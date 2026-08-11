# PaySuite Wasp — status (honest)

## Verified

| Check | Result |
|-------|--------|
| `wasp compile` | ✅ |
| API e2e (login→invoice→pdf→pay→portal) | ✅ **PASSED** |
| Portal external PayPal/Razorpay reference pay | ✅ via `recordPortalExternalPayment` |
| Real Argon2 mobile login | ✅ |
| PDF (`pdf-lib`) | ✅ |

## Feature coverage (product MVP)

| Area | Status |
|------|--------|
| Multi-tenant CRUD | Yes |
| Plan limits + activate plan | Yes |
| RBAC / invites / notifications | Yes |
| Real PDF + email send | Yes (Dummy email logs) |
| CSV import/export | Yes |
| Customer invoice portal | Yes (`/portal/invoice/:token`) |
| Estimate portal | Yes (`/portal/estimate/:token`) |
| Portal Stripe card | Needs real STRIPE keys |
| Portal external PSP ref (PayPal/Razorpay/bank) | Yes |
| Landlord CMS (FAQ/testimonials/content) | Yes (`/cms`, admin) |
| Subscription expired gate | Yes (402 + dashboard CTA) |
| Attachments | Yes (DB base64) |
| Mobile API CRUD + JWT | Yes |
| Mobile EN/AR shell | Yes |
| Playwright UI spec | Written (run with client up) |

## Still not full original commercial app

These remain **out of scope for a drop-in replacement** unless you invest more:

- Firebase push, OTP, social login, full Arabic RTL polish  
- Live Stripe/PayPal/Razorpay **merchant accounts + signed webhooks** end-to-end in production  
- DomPDF multi-template parity / print house fidelity  
- Full media library (S3)  
- Landlord multi-company delete workflows from original PHP  
- Automated browser e2e always green without Dummy-email quirks  

**Practical claim:** shippable multi-tenant billing **MVP** on Wasp + Expo client, with verified money path API e2e — **not** 1:1 of every Laravel/Flutter feature.

## Run

```bash
docker start paysuite-wasp-postgres
cd paysuite_wasp/app && PORT=3011 wasp start
EMAIL=… PASS=… API_BASE=http://127.0.0.1:3011 ../scripts/e2e-paysuite-api.sh
```
