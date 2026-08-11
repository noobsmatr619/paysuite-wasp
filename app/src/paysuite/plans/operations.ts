import { HttpError } from "wasp/server";
import type {
  GetPlans,
  GetMyPlan,
  GetBillings,
  EnsureDefaultPlans,
  UpdateMyProfile,
} from "wasp/server/operations";
import type { Plan, User } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";

export const ensureDefaultPlans: EnsureDefaultPlans<void, Plan[]> = async (
  _args,
  context,
) => {
  const count = await context.entities.Plan.count();
  if (count === 0) {
    await context.entities.Plan.createMany({
      data: [
        {
          name: "Free",
          tag: "free",
          frequency: "monthly",
          price: 0,
          isFree: true,
          isDefault: true,
          trialDays: 14,
          numberOfProducts: 20,
          numberOfCustomers: 20,
          numberOfEstimates: 50,
          numberOfInvoices: 50,
          status: "active",
        },
        {
          name: "Business",
          tag: "business",
          frequency: "monthly",
          price: 29,
          isFree: false,
          isDefault: false,
          numberOfProducts: 200,
          numberOfCustomers: 500,
          numberOfEstimates: 1000,
          numberOfInvoices: 1000,
          status: "active",
        },
        {
          name: "Enterprise",
          tag: "enterprise",
          frequency: "monthly",
          price: 99,
          isFree: false,
          isDefault: false,
          numberOfProducts: 9999,
          numberOfCustomers: 9999,
          numberOfEstimates: 9999,
          numberOfInvoices: 9999,
          status: "active",
        },
        {
          name: "Business Yearly",
          tag: "business-yearly",
          frequency: "yearly",
          price: 290,
          isFree: false,
          isDefault: false,
          numberOfProducts: 200,
          numberOfCustomers: 500,
          numberOfEstimates: 1000,
          numberOfInvoices: 1000,
          status: "active",
        },
      ],
    });
  }
  return context.entities.Plan.findMany({
    where: { status: "active" },
    orderBy: { price: "asc" },
  });
};

export const getPlans: GetPlans<void, Plan[]> = async (_args, context) => {
  return context.entities.Plan.findMany({
    where: { status: "active" },
    orderBy: { price: "asc" },
  });
};

export const getMyPlan: GetMyPlan<void, any> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const subscriber = await context.entities.Subscriber.findFirst({
    where: { tenantId },
    include: { plan: true, tenant: true },
    orderBy: { createdAt: "desc" },
  });

  const [productCount, customerCount, estimateCount, invoiceCount] =
    await Promise.all([
      context.entities.Product.count({ where: { tenantId } }),
      context.entities.Customer.count({ where: { tenantId } }),
      context.entities.Estimate.count({ where: { tenantId } }),
      context.entities.Invoice.count({ where: { tenantId } }),
    ]);

  return {
    subscriber,
    usage: {
      products: productCount,
      customers: customerCount,
      estimates: estimateCount,
      invoices: invoiceCount,
    },
    limits: subscriber?.plan
      ? {
          products: subscriber.plan.numberOfProducts,
          customers: subscriber.plan.numberOfCustomers,
          estimates: subscriber.plan.numberOfEstimates,
          invoices: subscriber.plan.numberOfInvoices,
        }
      : null,
  };
};

export const getBillings: GetBillings<void, any[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.BillingHistory.findMany({
    where: { tenantId },
    include: { plan: true, paymentMethod: true },
    orderBy: { createdAt: "desc" },
  });
};

export const updateMyProfile: UpdateMyProfile<
  {
    firstName?: string;
    lastName?: string;
    phoneCountry?: string;
    phoneNumber?: string;
    address?: string;
    companyName?: string;
    taxNo?: string;
  },
  User
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  return context.entities.User.update({
    where: { id: context.user.id },
    data: {
      firstName: args.firstName,
      lastName: args.lastName,
      phoneCountry: args.phoneCountry,
      phoneNumber: args.phoneNumber,
      address: args.address,
      companyName: args.companyName,
      taxNo: args.taxNo,
    },
  });
};
