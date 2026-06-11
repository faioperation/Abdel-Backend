import { Router } from "express";
import { WebhookController } from "./webhook.controller.js";

const router = Router();

// Public webhook route called by Vapi
router.post("/call", WebhookController.handleVapiWebhook);

export const WebhookRouter = router;
