import { Router } from "express";
import { OtpRouter } from "../modules/otp/otp.route.js";
import { AuthRouter } from "../modules/auth/auth.route.js";
import { TenantsRouter } from "../modules/systemOwner/tenants/tenants.route.js";
import { TelephonyRouter } from "../modules/systemOwner/telephony/telephony.route.js";
import { SubscriptionBillingRouter } from "../modules/systemOwner/subscription_billing/subscription_billing.route.js";
import { AiTrainingRouter } from "../modules/businessOwner/ai-training/ai-training.route.js";

export const router = Router();
const moduleRoutes = [
  // Common Routes
  {
    path: "/otp",
    route: OtpRouter,
  },

  {
    path: "/auth",
    route: AuthRouter,
  },

  // System Owner Routes

  {
    path: "/system-owner/tenants",
    route: TenantsRouter,
  },

  {
    path: "/system-owner/telephony",
    route: TelephonyRouter,
  },

  {
    path: "/system-owner/subscription-billing",
    route: SubscriptionBillingRouter,
  },

  // Business Owner Routes
  {
    path: "/business-owner/ai-training",
    route: AiTrainingRouter,
  },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

