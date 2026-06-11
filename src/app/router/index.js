import { Router } from "express";
import { OtpRouter } from "../modules/otp/otp.route.js";
import { AuthRouter } from "../modules/auth/auth.route.js";
import { TenantsRouter } from "../modules/systemOwner/tenants/tenants.route.js";
import { TelephonyRouter } from "../modules/systemOwner/telephony/telephony.route.js";
import { SubscriptionBillingRouter } from "../modules/systemOwner/subscription_billing/subscription_billing.route.js";
import { AiTrainingRouter } from "../modules/businessOwner/ai-training/ai-training.route.js";
import { CallHistoryRouter } from "../modules/businessOwner/call_history/call_history.route.js";
import { OrderManagmentRouter } from "../modules/businessOwner/order_managment/order_managment.route.js";
import { WebhookRouter } from "../modules/webhook/webhook.route.js";

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

  {
    path: "/business-owner/call-history",
    route: CallHistoryRouter,
  },

  {
    path: "/business-owner/order-managment",
    route: OrderManagmentRouter,
  },

  // Webhook Routes
  {
    path: "/webhook",
    route: WebhookRouter,
  },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});
