/** Shared permission keys (client + server safe). */
export const PERMISSIONS = [
  "customers.view",
  "customers.manage",
  "products.view",
  "products.manage",
  "invoices.view",
  "invoices.manage",
  "estimates.view",
  "estimates.manage",
  "expenses.view",
  "expenses.manage",
  "transactions.view",
  "transactions.manage",
  "tickets.view",
  "tickets.manage",
  "settings.manage",
  "users.manage",
  "reports.view",
  "billing.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
