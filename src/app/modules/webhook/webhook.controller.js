import { StatusCodes } from "http-status-codes";
import { envVars } from "../../config/env.js";
import { WebhookService } from "./webhook.service.js";

const handleVapiWebhook = async (req, res) => {
  try {
    const payload = req.body;

    // Vapi events contain the payload under message field
    const message = payload?.message;
    
    if (message && message.type === "end-of-call-report") {
      // Process call report asynchronously
      WebhookService.saveCallFromWebhook(message).catch((err) => {
        console.error("Error processing end-of-call-report webhook:", err);
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
    // Validate secret key from headers (check both x-api-key and Authorization)
    const apiKey = req.headers["x-api-key"] || req.headers["authorization"];
    const expectedSecret = envVars.WEBHOOK_FORWARD_SECRET;

    let token = apiKey;
    if (token && token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    if (!token || token !== expectedSecret) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized: Invalid or missing webhook secret key",
      });
    }

    const payload = req.body;
    const message = payload?.message;

    if (message && message.type === "end-of-call-report") {
      // Process call report asynchronously
      WebhookService.saveCallFromWebhook(message).catch((err) => {
        console.error("Error processing end-of-call-report webhook:", err);
      });
    } else {
      console.log(`Skipping unsupported webhook message type: ${message?.type || "unknown"}`);
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
