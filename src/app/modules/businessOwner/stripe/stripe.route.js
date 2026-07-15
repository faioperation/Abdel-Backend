import { Router } from "express";
import { StripeController } from "./stripe.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import { checkSubscriptionActive } from "../../../middleware/checkSubscriptionActive.js";
import validateRequest from "../../../middleware/validateRequest.js";
import { StripeValidation } from "./stripe.validation.js";

const router = Router();

router.use(checkAuthMiddleware(Role.RESTAURANT_OWNER));
router.use(checkSubscriptionActive);

router.post(
  "/keys",
  validateRequest(StripeValidation.updateStripeKeysSchema),
  StripeController.updateStripeKeys,
);

router.get("/keys", StripeController.getStripeKeys);

router.delete(
  "/keys/:restaurantId",
  validateRequest(StripeValidation.deleteStripeKeysSchema),
  StripeController.deleteStripeKeys,
);

export const BusinessOwnerStripeRouter = router;
