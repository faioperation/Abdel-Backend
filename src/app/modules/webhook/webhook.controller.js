import { StatusCodes } from "http-status-codes";
import { WebhookService } from "./webhook.service.js";
import DevBuildError from "../../lib/DevBuildError.js";

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
      console.log(
        "Responding to Vapi tool call with:",
        JSON.stringify(results, null, 2),
      );
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
      console.log(
        "Responding to forwarded Vapi tool call with:",
        JSON.stringify(results, null, 2),
      );
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

const renderPaymentSuccessPage = (orderNumber) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful - FoodVoice AI</title>
  <style>
    :root {
      --primary: #2ecc71;
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    body {
      background: radial-gradient(circle at top, #1e293b, var(--bg));
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 40px;
      text-align: center;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.6s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .success-icon {
      width: 80px;
      height: 80px;
      background: rgba(46, 204, 113, 0.15);
      border: 2px solid var(--primary);
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 24px;
      color: var(--primary);
      font-size: 40px;
      font-weight: bold;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 12px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    p {
      color: var(--text-muted);
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 24px;
    }
    .order-badge {
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 12px;
      padding: 12px 24px;
      display: inline-block;
      font-size: 15px;
      font-weight: 600;
      color: #38bdf8;
      margin-bottom: 24px;
    }
    .footer {
      font-size: 13px;
      color: #64748b;
      margin-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="success-icon">✓</div>
    <h1>Payment Successful</h1>
    <p>Thank you for your order! Your payment has been verified successfully. Our kitchen has started preparing your delicious food.</p>
    ${orderNumber ? `<div class="order-badge">Order Number: #${orderNumber}</div>` : ""}
    <div class="footer">
      Powered by FoodVoice AI
    </div>
  </div>
</body>
</html>
`;

const renderPaymentErrorPage = (message) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Verification Failed - FoodVoice AI</title>
  <style>
    :root {
      --primary: #e74c3c;
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    body {
      background: radial-gradient(circle at top, #1e293b, var(--bg));
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 40px;
      text-align: center;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.6s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .error-icon {
      width: 80px;
      height: 80px;
      background: rgba(231, 76, 60, 0.15);
      border: 2px solid var(--primary);
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 24px;
      color: var(--primary);
      font-size: 40px;
      font-weight: bold;
    }
    h1 {
      font-size: 28px;
      margin: 0 0 12px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    p {
      color: var(--text-muted);
      font-size: 16px;
      line-height: 1.6;
      margin: 0 0 24px;
    }
    .btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #2563eb;
    }
    .footer {
      font-size: 13px;
      color: #64748b;
      margin-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="error-icon">✗</div>
    <h1>Verification Failed</h1>
    <p>${message || "We could not verify your payment. Please try again or contact the restaurant support."}</p>
    <a href="#" class="btn" onclick="window.location.reload();">Retry Verification</a>
    <div class="footer">
      Powered by FoodVoice AI
    </div>
  </div>
</body>
</html>
`;

const verifyCustomerPayment = async (req, res) => {
  try {
    const { order_id, session_id } = req.query;

    if (!order_id || !session_id) {
      throw new DevBuildError(
        "order_id and session_id are required",
        StatusCodes.BAD_REQUEST,
      );
    }

    if (session_id === "failed") {
      return res
        .status(StatusCodes.OK)
        .send(
          renderPaymentErrorPage(
            "Payment was cancelled or failed. Please try again.",
          ),
        );
    }

    const result = await WebhookService.verifyCustomerPaymentInDB(
      order_id,
      session_id,
    );

    return res
      .status(StatusCodes.OK)
      .send(renderPaymentSuccessPage(result.orderNumber || ""));
  } catch (error) {
    console.error("Verify Customer Payment Error:", error);
    const errorMessage =
      error instanceof DevBuildError
        ? error.message
        : "An internal error occurred during payment verification";
    return res
      .status(StatusCodes.OK)
      .send(renderPaymentErrorPage(errorMessage));
  }
};

export const WebhookController = {
  handleVapiWebhook,
  handleForwardedWebhook,
  handlePrinterPoll,
  handlePrinterGetJob,
  handlePrinterConfirmJob,
  verifyCustomerPayment,
};
