# PaySuite Wasp — status (honest)

## Verified (2026-08-11)

| Check | Result |
|-------|--------|
| `wasp compile` | ✅ |
| API e2e login→invoice→pdf→pay→portal | ✅ PASSED |
| Mobile register + JWT | ✅ |
| Mobile forgot/OTP/reset password | ✅ (dev OTP) |
| Mobile clone invoice | ✅ |
| Mobile notes/taxes/PM/permissions | ✅ |
| Mobile plan auto-seed + activate | ✅ |
| Mobile customizations + account-delete | ✅ |
| PDF (pdf-lib) | ✅ |
| CMS choose-us / work-solution | ✅ |
| Landlord companies | ✅ `/landlord/companies` |

## Still not bit-for-bit original commercial app

Firebase push, real SMS OTP, full social OAuth, live PSP webhooks, DomPDF multi-template fidelity, S3 media, every Flutter filter pixel clone.

## Run

```bash
docker start paysuite-wasp-postgres
cd paysuite_wasp/app && PORT=3011 wasp start
EMAIL=… PASS=… API_BASE=http://127.0.0.1:3011 ../scripts/e2e-paysuite-api.sh
```
