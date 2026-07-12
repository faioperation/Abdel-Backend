import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

// Initialize Twilio client if credentials are provided
if (accountSid && authToken) {
  try {
    client = twilio(accountSid, authToken);
  } catch (err) {
    console.error("⚠️ Failed to initialize Twilio client:", err.message);
  }
} else {
  console.log(
    "⚠️ Twilio credentials missing in env. Running SMS in Mock Mode.",
  );
}

export const sendSms = async (to, body, from = null) => {
  if (!to) {
    console.warn("⚠️ Cannot send SMS: Customer phone number is missing.");
    return { success: false, error: "Missing phone number" };
  }

  const senderNumber = from || twilioNumber;

  // Handle Mock Mode
  if (!client || !senderNumber) {
    console.log("\n==================================================");
    console.log(
      `💬 [SMS MOCK MODE] to ${to} (from ${senderNumber || "No Sender"}):`,
    );
    console.log(body);
    console.log("==================================================\n");
    return {
      success: true,
      sid: `mock_sid_${Math.random().toString(36).substring(7)}`,
      mock: true,
    };
  }

  try {
    const message = await client.messages.create({
      body: body,
      from: senderNumber,
      to: to,
    });
    console.log(
      `💬 SMS sent successfully to ${to} from ${senderNumber} | SID: ${message.sid}`,
    );
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error(
      `❌ Failed to send SMS to ${to} from ${senderNumber}:`,
      error.message || error,
    );
    // Return error status instead of throwing so that webhook/tool calls don't crash
    return { success: false, error: error.message };
  }
};
