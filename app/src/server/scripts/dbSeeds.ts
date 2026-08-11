import { faker } from "@faker-js/faker";
import type { PrismaClient } from "@prisma/client";
import { type User } from "wasp/entities";
import {
  getSubscriptionPaymentPlanIds,
  SubscriptionStatus,
} from "../../payment/plans";

type MockUserData = Omit<User, "id">;

/**
 * Seeds mock platform users (admin analytics).
 */
export async function seedMockUsers(prismaClient: PrismaClient) {
  await Promise.all(
    generateMockUsersData(20).map((data) => prismaClient.user.create({ data })),
  );
}

/**
 * Seeds PaySuite default plans, departments, and priorities.
 */
export async function seedPaySuiteDefaults(prismaClient: PrismaClient) {
  const planCount = await prismaClient.plan.count();
  if (planCount === 0) {
    await prismaClient.plan.createMany({
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
          numberOfProducts: 200,
          numberOfCustomers: 500,
          numberOfEstimates: 1000,
          numberOfInvoices: 1000,
          status: "active",
        },
      ],
    });
  }

  if ((await prismaClient.department.count()) === 0) {
    await prismaClient.department.createMany({
      data: [
        { name: "General" },
        { name: "Billing" },
        { name: "Technical" },
        { name: "Sales" },
      ],
    });
  }

  if ((await prismaClient.priority.count()) === 0) {
    await prismaClient.priority.createMany({
      data: [
        { name: "Low" },
        { name: "Medium" },
        { name: "High" },
        { name: "Urgent" },
      ],
    });
  }
}

function generateMockUsersData(numOfUsers: number): MockUserData[] {
  return faker.helpers.multiple(generateMockUserData, { count: numOfUsers });
}

function generateMockUserData(): MockUserData {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const subscriptionStatus =
    faker.helpers.arrayElement<SubscriptionStatus | null>([
      ...Object.values(SubscriptionStatus),
      null,
    ]);
  const now = new Date();
  const createdAt = faker.date.past({ refDate: now });
  const timePaid = faker.date.between({ from: createdAt, to: now });
  const credits = subscriptionStatus
    ? 0
    : faker.number.int({ min: 0, max: 10 });
  const hasUserPaidOnStripe = !!subscriptionStatus || credits > 3;
  return {
    email: faker.internet.email({ firstName, lastName }),
    username: faker.internet.userName({ firstName, lastName }),
    createdAt,
    isAdmin: false,
    firstName,
    lastName,
    phoneCountry: null,
    phoneNumber: null,
    gender: null,
    address: null,
    companyName: faker.company.name(),
    taxNo: null,
    profilePicture: null,
    status: "active",
    tenantId: null,
    isSubscriber: false,
    credits,
    subscriptionStatus,
    lemonSqueezyCustomerPortalUrl: null,
    paymentProcessorUserId: hasUserPaidOnStripe
      ? `cus_test_${faker.string.uuid()}`
      : null,
    datePaid: hasUserPaidOnStripe
      ? faker.date.between({ from: createdAt, to: timePaid })
      : null,
    subscriptionPlan: subscriptionStatus
      ? faker.helpers.arrayElement(getSubscriptionPaymentPlanIds())
      : null,
  };
}
