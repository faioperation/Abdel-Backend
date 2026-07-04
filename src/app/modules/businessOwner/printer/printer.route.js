import { Router } from "express";
import { PrinterController } from "./printer.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";

const router = Router();

router.get(
  "/",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  PrinterController.getPrinters,
);

router.post(
  "/",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  PrinterController.createPrinter,
);

router.patch(
  "/:id",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  PrinterController.updatePrinter,
);

router.delete(
  "/:id",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  PrinterController.deletePrinter,
);

router.post(
  "/:id/print-order",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  PrinterController.queueOrderPrint,
);

export const PrinterRouter = router;
