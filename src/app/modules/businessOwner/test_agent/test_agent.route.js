import { Router } from "express";
import { TestAgentController } from "./test_agent.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import validateRequest from "../../../middleware/validateRequest.js";
import { TestAgentValidation } from "./test_agent.validation.js";

const router = Router();

router.get(
  "/agents",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  TestAgentController.getCallableAgents,
);

router.post(
  "/call",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  validateRequest(TestAgentValidation.startCallSchema),
  TestAgentController.startCall,
);

export const TestAgentRouter = router;
