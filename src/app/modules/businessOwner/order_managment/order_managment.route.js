import { Router } from "express";
import { OrderManagmentController } from "./order_managment.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";

const router = Router();

router.get(
  "/",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  OrderManagmentController.getOrders,
);

router.delete(
  "/:id",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  OrderManagmentController.deleteOrder,
);

export const OrderManagmentRouter = router;
