import { Router } from "express";
import { StripeController } from "./stripe.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import validateRequest from "../../../middleware/validateRequest.js";
import { StripeValidation } from "./stripe.validation.js";

const router = Router();

router.post(
  "/keys",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  validateRequest(StripeValidation.updateStripeKeysSchema),
  StripeController.updateStripeKeys,
);

router.get(
  "/keys",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  StripeController.getStripeKeys,
);

router.delete(
  "/keys/:restaurantId",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  validateRequest(StripeValidation.deleteStripeKeysSchema),
  StripeController.deleteStripeKeys,
);

export const BusinessOwnerStripeRouter = router;
