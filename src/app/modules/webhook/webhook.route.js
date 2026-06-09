import { Router } from "express";
import { WebhookController } from "./webhook.controller.js";

const router = Router();

// Public webhook route called by Vapi
router.post("/vapi", WebhookController.handleVapiWebhook);

export const WebhookRouter = router;
