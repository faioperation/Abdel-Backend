import { Router } from "express";
import { CallHistoryController } from "./call_history.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";

const router = Router();

router.get(
  "/",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  CallHistoryController.getCallHistory,
);

export const CallHistoryRouter = router;
