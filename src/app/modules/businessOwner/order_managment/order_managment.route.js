import { Router } from "express";
import { OrderManagmentController } from "./order_managment.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import { checkSubscriptionActive } from "../../../middleware/checkSubscriptionActive.js";

const router = Router();

router.use(checkAuthMiddleware(Role.RESTAURANT_OWNER));
router.use(checkSubscriptionActive);

router.get(
  "/",
  OrderManagmentController.getOrders,
);

router.delete(
  "/:id",
  OrderManagmentController.deleteOrder,
);

export const OrderManagmentRouter = router;
