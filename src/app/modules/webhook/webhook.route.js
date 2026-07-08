import { Router } from "express";
import { WebhookController } from "./webhook.controller.js";

const router = Router();

// Public webhook route called by Vapi
router.post("/call", WebhookController.handleVapiWebhook);

// Secure forwarded webhook route called by external AI developer
router.post("/forwarded-call", WebhookController.handleForwardedWebhook);

// Star CloudPRNT Printer endpoints
router.post("/printer/poll", WebhookController.handlePrinterPoll);
router.get("/printer/poll", WebhookController.handlePrinterGetJob);
router.delete("/printer/poll", WebhookController.handlePrinterConfirmJob);

// Public payment verification endpoint
router.get("/payment/verify", WebhookController.verifyCustomerPayment);

export const WebhookRouter = router;
