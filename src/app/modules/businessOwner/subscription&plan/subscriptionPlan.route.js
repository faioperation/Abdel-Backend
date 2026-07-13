import { Router } from "express";
import { SubscriptionPlanController } from "./subscriptionPlan.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";

const router = Router();

router.use(checkAuthMiddleware(Role.RESTAURANT_OWNER));

router.get("/", SubscriptionPlanController.getAllPlans);

router.get("/my-subscription", SubscriptionPlanController.getMySubscription);

router.get("/billing-history", SubscriptionPlanController.getBillingHistory);

export const SubscriptionPlanRouter = router;
