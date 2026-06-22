import { Router } from "express";
import { DashboardController } from "./dashboard.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";

const router = Router();

router.get(
  "/usage-minutes",
  checkAuthMiddleware(Role.SYSTEM_OWNER),
  DashboardController.getTenantUsage,
);

export const DashboardRouter = router;
