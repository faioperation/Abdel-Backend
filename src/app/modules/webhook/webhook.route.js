import { Router } from "express";
import { WebhookController } from "./webhook.controller.js";

const router = Router();

// Public webhook route called by Vapi
router.post("/call", WebhookController.handleVapiWebhook);

// Secure forwarded webhook route called by external AI developer
router.post("/forwarded-call", WebhookController.handleForwardedWebhook);

export const WebhookRouter = router;
