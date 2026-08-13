# Live verification — PaySuite Wasp

Run against the real `paysuite-wasp-postgres` database.

## Money path (scripts/e2e-paysuite-api.sh)

Full chain passed end to end:

| Step | Result |
|---|---|
| login (`/api/mobile/auth/login`) | JWT issued, tenant provisioned |
| create customer | id returned |
| create product | id returned |
| create invoice | `INV-00001` |
| invoice PDF | 2.2 KB generated |
| pay invoice | `status paid`, `due 0` |
| stats | `customerCount 1, invoiceCount 1, totalPaid 200, totalDue 0` |
| public portal invoice | resolves by token, `due 0` |

`E2E API SMOKE PASSED`.

## Operations added this session

Wasp operations need a Wasp session, not the mobile JWT, and email auth
requires verification first. The Dummy provider prints the link to the
server log; verifying then logging in via `/auth/email/login` yields a
`sessionId` usable as a bearer token.

Operations take superjson-enveloped args — `{"json":{...}}`. A bare
`{"recurring":true}` is parsed as empty args and silently returns
unfiltered results, which looks exactly like a broken filter.

| Operation | Result |
|---|---|
| `get-invoices` `{recurring:true}` | 0 rows — correct, none are recurring |
| `get-invoices` `{recurring:false}` | 1 row — the E2E invoice |
| `get-account-delete-reasons` | 6 id/name pairs |
| `get-tenant-reports` | returns `expenseByCategory` and `paymentsByCustomer`; the £200 E2E payment is attributed to "E2E Customer" |

## Schema

`Invoice.recurringInterval` exists as `text`; latest applied migration is
`20260813002104_recurring_interval`.

## Not covered

No browser drove the web client, and permission enforcement was not
exercised live — the E2E account is the tenant owner, which bypasses the
role checks by design. Those are covered by unit tests only.
