import { defineEnvValidationSchema } from "wasp/env";
import * as z from "zod";
import { authEnvSchema } from "./auth/env";

/**
 * PaySuite: optional integrations with safe defaults so `wasp start` works
 * without every OpenSaaS third-party key. Real Stripe keys still needed for live collect.
 */
const optionalIntegrations = z.object({
  // Stripe (optional until you collect payments)
  STRIPE_API_KEY: z.string().default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().default("whsec_placeholder"),
  PAYMENTS_HOBBY_SUBSCRIPTION_PLAN_ID: z.string().default("price_hobby_placeholder"),
  PAYMENTS_PRO_SUBSCRIPTION_PLAN_ID: z.string().default("price_pro_placeholder"),
  PAYMENTS_CREDITS_10_PLAN_ID: z.string().default("price_credits_placeholder"),

  // Mobile JWT
  MOBILE_JWT_SECRET: z.string().default("paysuite-dev-mobile-secret-change-me"),
  MOBILE_SHARED_PASSWORD: z.string().optional(),

  // Legacy OpenSaaS optional noise
  OPENAI_API_KEY: z.string().default("sk-placeholder"),
  AWS_S3_REGION: z.string().default("us-east-1"),
  AWS_S3_IAM_ACCESS_KEY: z.string().default("placeholder"),
  AWS_S3_IAM_SECRET_KEY: z.string().default("placeholder"),
  AWS_S3_FILES_BUCKET: z.string().default("placeholder"),
  PLAUSIBLE_API_KEY: z.string().default("placeholder"),
  PLAUSIBLE_SITE_ID: z.string().default("placeholder"),
  PLAUSIBLE_BASE_URL: z.string().default("https://plausible.io"),
  GOOGLE_ANALYTICS_CLIENT_EMAIL: z.string().default("placeholder@example.com"),
  GOOGLE_ANALYTICS_PRIVATE_KEY: z.string().default("placeholder"),
  GOOGLE_ANALYTICS_PROPERTY_ID: z.string().default("0"),
  LEMONSQUEEZY_API_KEY: z.string().default("placeholder"),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().default("placeholder"),
  LEMONSQUEEZY_STORE_ID: z.string().default("0"),
  POLAR_ORGANIZATION_ACCESS_TOKEN: z.string().default("placeholder"),
  POLAR_SANDBOX_MODE: z.string().default("true"),
  POLAR_WEBHOOK_SECRET: z.string().default("placeholder"),
});

export const serverEnvValidationSchema = defineEnvValidationSchema(
  authEnvSchema.merge(optionalIntegrations),
);
