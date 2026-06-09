import prisma from "../../prisma/client.js";

const saveCallFromWebhook = async (call) => {
  if (!call || !call.id) {
    console.warn("Invalid call payload received in webhook");
    return;
  }

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
    (call.endedReason && (call.endedReason.toLowerCase().includes("error") || call.endedReason.toLowerCase().includes("fail")))
  ) {
    status = "failed";
  }

  const duration = typeof call.duration === "number" ? Math.round(call.duration) : 0;
  const startTime = call.startedAt ? new Date(call.startedAt) : new Date();
  const endTime = call.endedAt ? new Date(call.endedAt) : new Date();

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
      recording_url: call.recordingUrl || "",
      transcript: call.transcript || "",
      duration,
      start_time: startTime,
      end_time: endTime,
    },
    update: {
      status,
      recording_url: call.recordingUrl || "",
      transcript: call.transcript || "",
      duration,
      end_time: endTime,
    },
  });

  console.log(`Call ${call.id} successfully processed and saved to database.`);
};

export const WebhookService = {
  saveCallFromWebhook,
};
