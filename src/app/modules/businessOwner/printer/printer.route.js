import { Router } from "express";
import { PrinterController } from "./printer.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import { checkSubscriptionActive } from "../../../middleware/checkSubscriptionActive.js";

const router = Router();

router.use(checkAuthMiddleware(Role.RESTAURANT_OWNER));
router.use(checkSubscriptionActive);

router.get("/", PrinterController.getPrinters);

router.get("/:id", PrinterController.getPrinterById);

router.post("/", PrinterController.createPrinter);

router.patch("/:id", PrinterController.updatePrinter);

router.delete("/:id", PrinterController.deletePrinter);

router.post("/:id/print-order", PrinterController.queueOrderPrint);

export const PrinterRouter = router;
