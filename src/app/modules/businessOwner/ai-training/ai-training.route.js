import { Router } from "express";
import multer from "multer";
import { AiTrainingController } from "./ai-training.controller.js";
import { checkAuthMiddleware } from "../../../middleware/checkAuthMiddleware.js";
import { Role } from "../../../utils/role.js";
import { checkSubscriptionActive } from "../../../middleware/checkSubscriptionActive.js";
import validateRequest from "../../../middleware/validateRequest.js";
import { AiTrainingValidation } from "./ai-training.validation.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(checkAuthMiddleware(Role.RESTAURANT_OWNER));
router.use(checkSubscriptionActive);

router.post(
  "/create",
  upload.single("file"),
  validateRequest(AiTrainingValidation.createAgentSchema),
  AiTrainingController.createAgent,
);

router.delete(
  "/delete/:id",
  AiTrainingController.deleteAgent,
);

router.get(
  "/",
  AiTrainingController.getAgentsByRestaurant,
);

export const AiTrainingRouter = router;
