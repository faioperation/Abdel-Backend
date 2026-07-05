import { StatusCodes } from "http-status-codes";
import { WebhookService } from "./webhook.service.js";

const handleVapiWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log(
      "Received Vapi webhook payload:",
      JSON.stringify(payload, null, 2),
    );

    const message = payload?.message || payload;

    // Synchronously process tool-calls
    if (message && message.type === "tool-calls") {
      const results = await WebhookService.processToolCalls(message);
      console.log("Responding to Vapi tool call with:", JSON.stringify(results, null, 2));
      return res.status(StatusCodes.OK).json(results);
    }

    if (message && (message.type === "end-of-call-report" || message.call)) {
      // Process call report asynchronously
      WebhookService.saveCallFromWebhook(message).catch((err) => {
        console.error("Error processing webhook call report:", err);
      });
    } else {
      console.log(
        `Skipping unsupported webhook message type: ${message?.type || "unknown"}`,
      );
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
    console.log(
      "Received forwarded webhook payload:",
      JSON.stringify(payload, null, 2),
    );
    const message = payload?.message || payload;

    // Synchronously process tool-calls
    if (message && message.type === "tool-calls") {
      const results = await WebhookService.processToolCalls(message);
      console.log("Responding to forwarded Vapi tool call with:", JSON.stringify(results, null, 2));
      return res.status(StatusCodes.OK).json(results);
    }

    if (message && (message.type === "end-of-call-report" || message.call)) {
      // Process call report asynchronously
      WebhookService.saveCallFromWebhook(message).catch((err) => {
        console.error("Error processing forwarded webhook call report:", err);
      });
    } else {
      console.log(
        `Skipping unsupported forwarded webhook message type: ${message?.type || "unknown"}`,
      );
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

import { PrinterWebhookService } from "./printerWebhook.service.js";

const handlePrinterPoll = async (req, res) => {
  try {
    const { printerMAC, statusCode } = req.body;
    console.log(
      `CloudPRNT Poll: Received poll from printer ${printerMAC} with status ${statusCode}`,
    );

    const result = await PrinterWebhookService.handlePrinterPoll(
      printerMAC,
      statusCode,
    );

    if (result.jobReady) {
      return res.status(StatusCodes.OK).json(result);
    } else {
      // Star CloudPRNT accepts 204 No Content or 200 with jobReady: false
      return res.status(StatusCodes.NO_CONTENT).send();
    }
  } catch (error) {
    console.error("CloudPRNT Poll Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "An internal error occurred",
    });
  }
};

const handlePrinterGetJob = async (req, res) => {
  try {
    const jobToken =
      req.query.jobToken || req.query.token || req.query.jobtoken;
    console.log(
      `CloudPRNT GetJob: Requesting job content for token: ${jobToken}`,
    );

    const receiptText =
      await PrinterWebhookService.getPrintJobContent(jobToken);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(StatusCodes.OK).send(receiptText);
  } catch (error) {
    console.error("CloudPRNT GetJob Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error generating receipt");
  }
};

const handlePrinterConfirmJob = async (req, res) => {
  try {
    const jobToken =
      req.query.jobToken || req.query.token || req.query.jobtoken;
    const code = req.query.code;
    const mac = req.query.mac;

    console.log(
      `CloudPRNT ConfirmJob: Received confirmation for token: ${jobToken}, status code: ${code}, MAC: ${mac}`,
    );

    await PrinterWebhookService.confirmPrintJob(jobToken, code);

    // Respond with empty 200 OK (no body, per protocol)
    return res.status(StatusCodes.OK).send();
  } catch (error) {
    console.error("CloudPRNT ConfirmJob Error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send();
  }
};

export const WebhookController = {
  handleVapiWebhook,
  handleForwardedWebhook,
  handlePrinterPoll,
  handlePrinterGetJob,
  handlePrinterConfirmJob,
};
