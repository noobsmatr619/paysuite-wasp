# PaySuite (Wasp + TypeScript)

Full-stack conversion of the PaySuite multi-tenant billing suite from:

- Laravel + Vue (`paysuite/main/web`) → **Wasp / React / Prisma / TypeScript**
- Original tree is **read-only**; all work lives here.

## Stack

- [Wasp](https://wasp.sh) `^0.22`
- React + TypeScript UI
- Prisma / PostgreSQL
- Stripe (OpenSaaS payment plumbing retained for SaaS plan checkout)
- REST bridge for Expo: `ALL /api/mobile/*`

## Domain modules

| Module | Routes | Operations |
|--------|--------|------------|
| Dashboard | `/dashboard` | stats, payment overview, income/expense |
| Customers | `/customers` | CRUD |
| Products | `/products` | CRUD + categories/units |
| Invoices | `/invoices` | create, clone, due payment |
| Estimates | `/estimates` | CRUD, status, convert→invoice |
| Expenses | `/expenses` | CRUD |
| Transactions | `/transactions` | list + payment methods |
| Tickets | `/tickets` | create, comments, rating, status |
| Taxes / notes | Settings | CRUD |
| Plans / billing | `/plans` | plans, usage, billing history |
| Settings / profile | `/settings` | profile, taxes, methods, notes |

Multi-tenant: each user gets a `Tenant` on first authenticated use; all business rows are tenant-scoped.

## Quick start

```bash
cd app
# Install Wasp CLI if needed: https://wasp.sh/docs/quick-start
wasp start db          # Postgres (Docker)
wasp db migrate-dev    # apply schema
wasp db seed           # optional demo plans/users
wasp start             # client + server
```

Default auth redirect: `/dashboard`.

### Ports

Do **not** hardcode client URL to `:3000` in tooling. Prefer:

| Service | Typical port |
|---------|----------------|
| Wasp server / API | `3001` |
| Wasp client | env / Wasp default |
| Mobile `EXPO_PUBLIC_API_URL` | server host + API port (e.g. `http://HOST:3001`) |

E2E base URL: `PLAYWRIGHT_BASE_URL` (defaults to `http://127.0.0.1:3001` in config).

## Mobile API

```
Authorization: Bearer <userId>
GET  /api/mobile/statistics
GET  /api/mobile/customers
POST /api/mobile/customers
GET  /api/mobile/invoices
GET  /api/mobile/products
GET  /api/mobile/estimates
GET  /api/mobile/expenses
GET  /api/mobile/tickets
GET  /api/mobile/transactions
GET  /api/mobile/my-profile
GET  /api/mobile/my-plan
```

## Next phases

1. PDF invoice/estimate export
2. Recurring invoices job
3. Real JWT for mobile
4. Landlord (super-admin) company reports UI
5. Stripe/PayPal/Razorpay customer payment collection on invoices
