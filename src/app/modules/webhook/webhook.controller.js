import { StatusCodes } from "http-status-codes";
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

export const WebhookController = {
  handleVapiWebhook,
};
