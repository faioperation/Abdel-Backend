import { Router } from "express";
import multer from "multer";
import { AiTrainingController } from "./ai-training.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import validateRequest from "../../../middleware/validateRequest.js";
import { AiTrainingValidation } from "./ai-training.validation.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/create",
  checkAuthMiddleware(Role.RESTAURANT_OWNER),
  upload.single("file"),
  validateRequest(AiTrainingValidation.createAgentSchema),
  AiTrainingController.createAgent,
);

export const AiTrainingRouter = router;
