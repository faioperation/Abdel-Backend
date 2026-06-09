import prisma from "../../prisma/client.js";

const saveCallFromWebhook = async (message) => {
  if (!message || !message.call || !message.call.id) {
    console.warn("Invalid message payload received in webhook");
    return;
  }

  const call = message.call;

  // 1. Find local agent matching the vapi assistant id
  if (!call.assistantId) {
    console.warn(`Call ${call.id} does not have an assistantId`);
    return;
  }

  const agent = await prisma.agents.findFirst({
    where: { vapi_assistant_id: call.assistantId },
  });

  if (!agent) {
    console.warn(`No local agent found for Vapi assistant ID: ${call.assistantId}`);
    return;
  }

  const restaurantId = agent.restaurant_id;

  // 2. Find or create a customer record using phone number
  const phone = call.customer?.number || "Unknown";
  let customer = await prisma.customers.findFirst({
    where: {
      phone,
      restaurant_id: restaurantId,
    },
  });

  if (!customer) {
    customer = await prisma.customers.create({
      data: {
        restaurant_id: restaurantId,
        name: "Unknown",
        phone,
        email: "",
        total_orders: 0,
      },
    });
  }

  // 3. Mapping fields to database schema
  // Map Type
  let type = "outbound";
  if (call.type && call.type.toLowerCase().includes("inbound")) {
    type = "inbound";
  }

  // Map Status
  let status = "completed";
  if (call.status === "in-progress") {
    status = "ongoing";
  } else if (call.status === "transferred") {
    status = "transferred";
  } else if (
    call.status === "failed" ||
    (message.endedReason && (message.endedReason.toLowerCase().includes("error") || message.endedReason.toLowerCase().includes("fail")))
  ) {
    status = "failed";
  }

  // Read durationSeconds from message or duration from call
  let duration = typeof message.durationSeconds === "number" ? Math.round(message.durationSeconds) : 0;
  if (duration === 0 && typeof call.duration === "number") {
    duration = Math.round(call.duration);
  }
  if (duration === 0 && message.startedAt && message.endedAt) {
    const diffMs = new Date(message.endedAt) - new Date(message.startedAt);
    duration = Math.max(0, Math.round(diffMs / 1000));
  }

  // Read recordingUrl and transcript from message or call
  const recordingUrl = message.recordingUrl || 
                       call.recordingUrl || 
                       message.artifact?.recordingUrl || 
                       call.artifact?.recordingUrl || 
                       message.artifact?.recording?.mono?.combinedUrl || 
                       call.artifact?.recording?.mono?.combinedUrl || 
                       "";

  const transcript = message.transcript || call.transcript || message.artifact?.transcript || call.artifact?.transcript || "";

  const startTime = message.startedAt ? new Date(message.startedAt) : (call.startedAt ? new Date(call.startedAt) : new Date());
  const endTime = message.endedAt ? new Date(message.endedAt) : (call.endedAt ? new Date(call.endedAt) : new Date());

  // 4. Upsert the call record in database
  await prisma.calls.upsert({
    where: { id: call.id },
    create: {
      id: call.id,
      restaurant_id: restaurantId,
      customer_id: customer.id,
      agent_id: agent.id,
      type,
      status,
      recording_url: recordingUrl,
      transcript: transcript,
      duration,
      start_time: startTime,
      end_time: endTime,
    },
    update: {
      status,
      recording_url: recordingUrl,
      transcript: transcript,
      duration,
      end_time: endTime,
    },
  });

  console.log(`Call ${call.id} successfully processed and saved to database.`);
};

export const WebhookService = {
  saveCallFromWebhook,
};
