import prisma from "../../prisma/client.js";

const saveCallFromWebhook = async (message) => {
  if (!message || !message.call || !message.call.id) {
    console.warn("Invalid message payload received in webhook");
    return;
  }

  const call = message.call;

  // 1. Find local agent matching the vapi assistant id
  let agent = null;
  if (call.assistantId) {
    agent = await prisma.agents.findFirst({
      where: { vapi_assistant_id: call.assistantId },
    });
  } else {
    console.warn(`Call ${call.id} does not have an assistantId in payload`);
  }

  // Fallback 1: Try finding by twilio_number if assistantId match failed
  if (!agent) {
    const twilioNumber = call.phoneNumber?.number || 
                         (typeof call.phoneNumber === "string" ? call.phoneNumber : null) ||
                         call.vapiPhoneNumber ||
                         call.vapiPhoneNumber?.number;
    
    if (twilioNumber) {
      const cleanNumber = twilioNumber.replace(/^\+/, "");
      agent = await prisma.agents.findFirst({
        where: {
          twilio_number: {
            contains: cleanNumber,
          },
        },
      });
    }
  }

  // Fallback 2: Fall back to the first available agent in the database so that the call is saved
  if (!agent) {
    agent = await prisma.agents.findFirst();
    if (agent) {
      console.warn(`No local agent found for Vapi assistant ID: ${call.assistantId || "none"}. Falling back to agent: ${agent.agent_name} (${agent.id}) so that the call can be saved.`);
    }
  }

  if (!agent) {
    console.error(`Cannot save call ${call.id} because no agents exist in the database.`);
    return;
  }

  const restaurantId = agent.restaurant_id;

  // 2. Find or create a customer record using phone number
  const phone = call.customer?.number || 
                call.customer?.phone || 
                (typeof call.customer === "string" ? call.customer : null) || 
                call.customerNumber || 
                "Unknown";
  let name = call.customer?.name || "Unknown";

  // Check if we can find the customer name from tool calls or message
  if (name === "Unknown") {
    if (message.customer?.name) {
      name = message.customer.name;
    }
  }

  // Parse tool calls if any to see if we can find customer_name/customerName and/or order details
  let toolCallData = null;
  const toolCalls = message.toolCalls || call.toolCalls || message.toolCallList || [];
  for (const tc of toolCalls) {
    if (tc.function?.arguments) {
      try {
        const args = typeof tc.function.arguments === "string" 
          ? JSON.parse(tc.function.arguments) 
          : tc.function.arguments;
        if (args) {
          if (name === "Unknown") {
            name = args.customer_name || args.customerName || args.name || "Unknown";
          }
          if (tc.function.name === "save_order") {
            toolCallData = args;
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  // Also check message.analysis?.structuredData if name is still Unknown
  if (name === "Unknown") {
    const structuredData = message.analysis?.structuredData || {};
    name = structuredData.customer_name || structuredData.customerName || "Unknown";
  }

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
        name,
        phone,
        email: "",
        total_orders: 0,
      },
    });
  } else if (customer.name === "Unknown" && name !== "Unknown") {
    customer = await prisma.customers.update({
      where: { id: customer.id },
      data: { name },
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

  // 4. Upsert/Update the call record in database with merge logic to prevent overwriting with empty data
  const existingCall = await prisma.calls.findUnique({
    where: { id: call.id },
  });

  if (existingCall) {
    const terminalStatuses = ["completed", "failed", "transferred"];
    const finalStatus = terminalStatuses.includes(existingCall.status)
      ? existingCall.status
      : status;

    await prisma.calls.update({
      where: { id: call.id },
      data: {
        status: finalStatus,
        recording_url: recordingUrl || existingCall.recording_url,
        transcript: transcript || existingCall.transcript,
        duration: duration || existingCall.duration,
        end_time: endTime || existingCall.end_time,
      },
    });
  } else {
    await prisma.calls.create({
      data: {
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
    });
  }

  console.log(`Call ${call.id} successfully processed and saved to database.`);

  // 5. Try to extract order details from Vapi's structured data/summary
  const analysis = message.analysis || {};
  let structuredData = analysis.structuredData || {};

  // If structuredData doesn't have order items or total, but we got toolCallData from a "save_order" tool call, merge/use it!
  if (toolCallData && (!structuredData.items || structuredData.items.length === 0) && !structuredData.total) {
    structuredData = {
      ...structuredData,
      items: toolCallData.order_items || toolCallData.items || [],
      total: toolCallData.total_price || toolCallData.total || 0,
      order_placed: true,
      is_order: true
    };
  }

  // Check if an order was placed
  const hasOrder = 
    structuredData.order_placed === true ||
    structuredData.is_order === true ||
    (structuredData.items && Array.isArray(structuredData.items) && structuredData.items.length > 0) ||
    (typeof structuredData.total === "number" && structuredData.total > 0) ||
    (typeof structuredData.total === "string" && parseFloat(structuredData.total) > 0);

  if (hasOrder) {
    // Determine total, subtotal, and tax
    let total = 0.0;
    if (typeof structuredData.total === "number") {
      total = structuredData.total;
    } else if (typeof structuredData.total === "string") {
      total = parseFloat(structuredData.total) || 0.0;
    }

    let subtotal = total;
    if (typeof structuredData.subtotal === "number") {
      subtotal = structuredData.subtotal;
    } else if (typeof structuredData.subtotal === "string") {
      subtotal = parseFloat(structuredData.subtotal) || 0.0;
    }

    let tax = 0.0;
    if (typeof structuredData.tax === "number") {
      tax = structuredData.tax;
    } else if (typeof structuredData.tax === "string") {
      tax = parseFloat(structuredData.tax) || 0.0;
    }

    if (subtotal === total && tax > 0) {
      subtotal = Math.max(0, total - tax);
    }

    // Determine pickup time
    let pickupTime = new Date();
    if (structuredData.pickup_time) {
      const parsedDate = new Date(structuredData.pickup_time);
      if (!isNaN(parsedDate.getTime())) {
        pickupTime = parsedDate;
      }
    } else {
      pickupTime.setMinutes(pickupTime.getMinutes() + 30); // Default to 30 mins
    }

    // Format notes/items
    let notes = "";
    if (structuredData.items && Array.isArray(structuredData.items)) {
      notes = JSON.stringify(structuredData.items);
    } else if (typeof structuredData.notes === "string") {
      notes = structuredData.notes;
    } else if (analysis.summary) {
      notes = analysis.summary;
    }

    // Check if order already exists for this call to prevent duplicates on retries
    const existingOrder = await prisma.orders.findFirst({
      where: { call_id: call.id },
    });

    if (existingOrder) {
      await prisma.orders.update({
        where: { id: existingOrder.id },
        data: {
          notes,
          subtotal,
          tax,
          total,
          pickup_time: pickupTime,
        },
      });
      console.log(`Order updated for call ${call.id}`);
    } else {
      // Generate a sequential order number for the restaurant
      const orderCount = await prisma.orders.count({
        where: { restaurant_id: restaurantId },
      });
      const orderNumber = String(orderCount + 1);

      await prisma.orders.create({
        data: {
          restaurant_id: restaurantId,
          customer_id: customer.id,
          call_id: call.id,
          order_number: orderNumber,
          order_status: "pending",
          payment_status: "pending",
          notes,
          subtotal,
          tax,
          total,
          pickup_time: pickupTime,
        },
      });

      // Update customer total_orders count
      await prisma.customers.update({
        where: { id: customer.id },
        data: {
          total_orders: {
            increment: 1,
          },
        },
      });

      console.log(`Order created for call ${call.id} with order number: ${orderNumber}`);
    }
  }
};

export const WebhookService = {
  saveCallFromWebhook,
};
