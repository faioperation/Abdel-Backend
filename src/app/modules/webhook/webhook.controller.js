import { StatusCodes } from "http-status-codes";
import { WebhookService } from "./webhook.service.js";

const handleVapiWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log("Received Vapi webhook payload:", JSON.stringify(payload, null, 2));

    // Vapi events contain the payload under message field or direct payload
    const message = payload?.message || payload;
    
    if (message && (message.type === "end-of-call-report" || message.call)) {
      // Process call report asynchronously
      WebhookService.saveCallFromWebhook(message).catch((err) => {
        console.error("Error processing webhook call report:", err);
      });
    } else {
      console.log(`Skipping unsupported webhook message type: ${message?.type || "unknown"}`);
    }

    // Always return 200 OK to Vapi to prevent retries
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("Vapi Webhook Controller Error:", error);
    // Still return 200 to not block Vapi
    return res.status(StatusCodes.OK).json({
      success: false,
      message: error.message || "An internal error occurred",
    });
  }
};

const handleForwardedWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log("Received forwarded webhook payload:", JSON.stringify(payload, null, 2));
    // Support both nested message and direct payload
    const message = payload?.message || payload;

    if (message && (message.type === "end-of-call-report" || message.call)) {
      // Process call report asynchronously
      WebhookService.saveCallFromWebhook(message).catch((err) => {
        console.error("Error processing forwarded webhook call report:", err);
      });
    } else {
      console.log(`Skipping unsupported forwarded webhook message type: ${message?.type || "unknown"}`);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Forwarded webhook processed successfully",
    });
  } catch (error) {
    console.error("Forwarded Webhook Controller Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "An internal error occurred",
    });
  }
};

export const WebhookController = {
  handleVapiWebhook,
  handleForwardedWebhook,
};
