import { routes } from "wasp/client/router";
import type { NavigationItem } from "./NavBar";

export const marketingNavigationItems: NavigationItem[] = [
  { name: "Features", to: "/#features" },
  { name: "Pricing", to: routes.PricingPageRoute.to },
] as const;

export const demoNavigationitems: NavigationItem[] = [
  { name: "Dashboard", to: routes.DashboardRoute.to },
  { name: "Customers", to: routes.CustomersRoute.to },
  { name: "Invoices", to: routes.InvoicesRoute.to },
  { name: "Recurring", to: routes.RecurringInvoicesRoute.to },
  { name: "Estimates", to: routes.EstimatesRoute.to },
  { name: "Products", to: routes.ProductsRoute.to },
  { name: "Expenses", to: routes.ExpensesRoute.to },
  { name: "Transactions", to: routes.TransactionsRoute.to },
  { name: "Tickets", to: routes.TicketsRoute.to },
  { name: "Reports", to: routes.ReportsRoute.to },
  { name: "Plans", to: routes.PlansRoute.to },
  { name: "Users", to: routes.UsersRolesRoute.to },
  { name: "Import", to: routes.ImportExportRoute.to },
  { name: "Landlord", to: routes.LandlordReportsRoute.to },
  { name: "Companies", to: routes.LandlordCompaniesRoute.to },
  { name: "CMS", to: routes.CmsAdminRoute.to },
  { name: "Settings", to: routes.SettingsRoute.to },
] as const;
