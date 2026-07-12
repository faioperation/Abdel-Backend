import prisma from "../../prisma/client.js";
import Stripe from "stripe";
import { sendSms } from "../../utils/sendSms.js";
import DevBuildError from "../../lib/DevBuildError.js";
import { StatusCodes } from "http-status-codes";

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
    const twilioNumber =
      call.phoneNumber?.number ||
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
      console.warn(
        `No local agent found for Vapi assistant ID: ${call.assistantId || "none"}. Falling back to agent: ${agent.agent_name} (${agent.id}) so that the call can be saved.`,
      );
    }
  }

  if (!agent) {
    console.error(
      `Cannot save call ${call.id} because no agents exist in the database.`,
    );
    return;
  }

  const restaurantId = agent.restaurant_id;

  // 2. Find or create a customer record using phone number
  const phone =
    call.customer?.number ||
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
  const toolCalls =
    message.toolCalls || call.toolCalls || message.toolCallList || [];
  for (const tc of toolCalls) {
    if (tc.function?.arguments) {
      try {
        const args =
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
        if (args) {
          if (name === "Unknown") {
            name =
              args.customer_name || args.customerName || args.name || "Unknown";
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
    name =
      structuredData.customer_name || structuredData.customerName || "Unknown";
  }

  const existingCall = await prisma.calls.findUnique({
    where: { id: call.id },
  });

  let customer = null;
  if (existingCall) {
    customer = await prisma.customers.findUnique({
      where: { id: existingCall.customer_id },
    });
  }

  const isUnknownPhone =
    !phone || phone.toLowerCase() === "unknown" || phone.trim() === "";

  if (!customer) {
    if (!isUnknownPhone) {
      customer = await prisma.customers.findFirst({
        where: {
          phone,
          restaurant_id: restaurantId,
        },
      });
    }
  }

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
  } else if (name !== "Unknown" && customer.name !== name) {
    if (!isUnknownPhone || customer.name === "Unknown" || existingCall) {
      customer = await prisma.customers.update({
        where: { id: customer.id },
        data: { name },
      });
    }
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
    (message.endedReason &&
      (message.endedReason.toLowerCase().includes("error") ||
        message.endedReason.toLowerCase().includes("fail")))
  ) {
    status = "failed";
  }

  // Read durationSeconds from message or duration from call
  let duration =
    typeof message.durationSeconds === "number"
      ? Math.round(message.durationSeconds)
      : 0;
  if (duration === 0 && typeof call.duration === "number") {
    duration = Math.round(call.duration);
  }
  if (duration === 0 && message.startedAt && message.endedAt) {
    const diffMs = new Date(message.endedAt) - new Date(message.startedAt);
    duration = Math.max(0, Math.round(diffMs / 1000));
  }

  // Read recordingUrl and transcript from message or call
  const recordingUrl =
    message.recordingUrl ||
    call.recordingUrl ||
    message.artifact?.recordingUrl ||
    call.artifact?.recordingUrl ||
    message.artifact?.recording?.mono?.combinedUrl ||
    call.artifact?.recording?.mono?.combinedUrl ||
    "";

  const transcript =
    message.transcript ||
    call.transcript ||
    message.artifact?.transcript ||
    call.artifact?.transcript ||
    "";

  const startTime = message.startedAt
    ? new Date(message.startedAt)
    : call.startedAt
      ? new Date(call.startedAt)
      : new Date();
  const endTime = message.endedAt
    ? new Date(message.endedAt)
    : call.endedAt
      ? new Date(call.endedAt)
      : new Date();

  // 4. Upsert/Update the call record in database with merge logic to prevent overwriting with empty data
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
  if (
    toolCallData &&
    (!structuredData.items || structuredData.items.length === 0) &&
    !structuredData.total
  ) {
    structuredData = {
      ...structuredData,
      items: toolCallData.order_items || toolCallData.items || [],
      total: toolCallData.total_price || toolCallData.total || 0,
      order_placed: true,
      is_order: true,
    };
  }

  // Check if an order was placed
  const hasOrder =
    structuredData.order_placed === true ||
    structuredData.is_order === true ||
    (structuredData.items &&
      Array.isArray(structuredData.items) &&
      structuredData.items.length > 0) ||
    (typeof structuredData.total === "number" && structuredData.total > 0) ||
    (typeof structuredData.total === "string" &&
      parseFloat(structuredData.total) > 0);

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

    // Extract order type and delivery address
    let orderType = "pickup";
    let deliveryAddress = null;

    if (structuredData.order_type || structuredData.orderType) {
      orderType = String(structuredData.order_type || structuredData.orderType);
    } else if (
      toolCallData &&
      (toolCallData.order_type || toolCallData.orderType)
    ) {
      orderType = String(toolCallData.order_type || toolCallData.orderType);
    }
    orderType =
      orderType.toLowerCase().trim() === "delivery" ? "delivery" : "pickup";

    if (
      structuredData.delivery_address ||
      structuredData.deliveryAddress ||
      structuredData.address
    ) {
      deliveryAddress = String(
        structuredData.delivery_address ||
          structuredData.deliveryAddress ||
          structuredData.address,
      );
    } else if (
      toolCallData &&
      (toolCallData.delivery_address ||
        toolCallData.deliveryAddress ||
        toolCallData.address)
    ) {
      deliveryAddress = String(
        toolCallData.delivery_address ||
          toolCallData.deliveryAddress ||
          toolCallData.address,
      );
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
          order_type: orderType,
          delivery_address: deliveryAddress,
        },
      });
      console.log(`Order updated for call ${call.id}`);
    } else {
      // Generate a sequential order number for the restaurant
      const orderCount = await prisma.orders.count({
        where: { restaurant_id: restaurantId },
      });
      const orderNumber = String(orderCount + 1);

      const order = await prisma.orders.create({
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
          order_type: orderType,
          delivery_address: deliveryAddress,
        },
      });

      // Check if Stripe is configured for this restaurant
      const restaurantInfo = await prisma.restaurants.findUnique({
        where: { id: restaurantId },
        select: { stripe_secret_key: true },
      });
      const hasStripe = !!restaurantInfo?.stripe_secret_key;

      if (!hasStripe) {
        // Automatically queue print jobs for any registered printers immediately (cash order)
        await queuePrintJobs(restaurantId, order.id);
      }

      // Update customer total_orders count
      await prisma.customers.update({
        where: { id: customer.id },
        data: {
          total_orders: {
            increment: 1,
          },
        },
      });

      console.log(
        `Order created for call ${call.id} with order number: ${orderNumber}`,
      );

      // Generate payment link and send via SMS (async)
      generateAndSendPaymentLink(order.id).catch((err) => {
        console.error("Error in generateAndSendPaymentLink:", err);
      });
    }
  }
};

const processToolCalls = async (message) => {
  if (!message || !message.call || !message.call.id) {
    console.warn("Invalid message payload received in tool-calls webhook");
    return { results: [] };
  }

  const call = message.call;
  const toolCalls = message.toolCalls || [];
  const results = [];

  // 1. Find local agent
  let agent = null;
  if (call.assistantId) {
    agent = await prisma.agents.findFirst({
      where: { vapi_assistant_id: call.assistantId },
    });
  }
  if (!agent) {
    const twilioNumber =
      call.phoneNumber?.number ||
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
  if (!agent) {
    agent = await prisma.agents.findFirst();
  }

  if (!agent) {
    console.error(
      `Cannot process tool call because no agents exist in database.`,
    );
    return { results: [] };
  }

  const restaurantId = agent.restaurant_id;

  // 2. Resolve customer
  const phone =
    call.customer?.number ||
    call.customer?.phone ||
    (typeof call.customer === "string" ? call.customer : null) ||
    call.customerNumber ||
    "Unknown";
  let name = call.customer?.name || "Unknown";

  // Check tool call arguments for customer name
  for (const tc of toolCalls) {
    if (tc.function?.arguments) {
      try {
        const args =
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;
        if (args && name === "Unknown") {
          name =
            args.customer_name || args.customerName || args.name || "Unknown";
        }
      } catch (e) {}
    }
  }

  const existingCall = await prisma.calls.findUnique({
    where: { id: call.id },
  });

  let customer = null;
  if (existingCall) {
    customer = await prisma.customers.findUnique({
      where: { id: existingCall.customer_id },
    });
  }

  const isUnknownPhone =
    !phone || phone.toLowerCase() === "unknown" || phone.trim() === "";

  if (!customer) {
    if (!isUnknownPhone) {
      customer = await prisma.customers.findFirst({
        where: { phone, restaurant_id: restaurantId },
      });
    }
  }

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
  } else if (name !== "Unknown" && customer.name !== name) {
    if (!isUnknownPhone || customer.name === "Unknown" || existingCall) {
      customer = await prisma.customers.update({
        where: { id: customer.id },
        data: { name },
      });
    }
  }

  // 3. Upsert call record (status is ongoing since this runs during the call)
  if (!existingCall) {
    await prisma.calls.create({
      data: {
        id: call.id,
        restaurant_id: restaurantId,
        customer_id: customer.id,
        agent_id: agent.id,
        type:
          call.type && call.type.toLowerCase().includes("inbound")
            ? "inbound"
            : "outbound",
        status: "ongoing",
        recording_url: "",
        transcript: "",
        duration: 0,
        start_time: new Date(call.startedAt || new Date()),
        end_time: new Date(),
      },
    });
  }

  // 4. Process each tool call
  for (const tc of toolCalls) {
    if (tc.function?.name === "save_order") {
      try {
        const args =
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;

        if (args) {
          // Parse details
          const items = args.order_items || args.items || [];
          const notes = JSON.stringify(items);

          let total = 0.0;
          if (typeof args.total_price === "number") total = args.total_price;
          else if (typeof args.total === "number") total = args.total;
          else if (typeof args.total_price === "string")
            total = parseFloat(args.total_price) || 0.0;
          else if (typeof args.total === "string")
            total = parseFloat(args.total) || 0.0;

          let subtotal = total;
          if (typeof args.subtotal === "number") subtotal = args.subtotal;
          else if (typeof args.subtotal === "string")
            subtotal = parseFloat(args.subtotal) || 0.0;

          let tax = 0.0;
          if (typeof args.tax === "number") tax = args.tax;
          else if (typeof args.tax === "string")
            tax = parseFloat(args.tax) || 0.0;

          if (subtotal === total && tax > 0) {
            subtotal = Math.max(0, total - tax);
          }

          let pickupTime = new Date();
          if (args.pickup_time) {
            const parsedDate = new Date(args.pickup_time);
            if (!isNaN(parsedDate.getTime())) {
              pickupTime = parsedDate;
            }
          } else {
            pickupTime.setMinutes(pickupTime.getMinutes() + 30);
          }

          // Extract order type and delivery address
          let orderType = "pickup";
          if (args.order_type || args.orderType) {
            orderType = String(args.order_type || args.orderType);
          }
          orderType =
            orderType.toLowerCase().trim() === "delivery"
              ? "delivery"
              : "pickup";

          let deliveryAddress = null;
          if (args.delivery_address || args.deliveryAddress || args.address) {
            deliveryAddress = String(
              args.delivery_address || args.deliveryAddress || args.address,
            );
          }

          // Check if order exists
          const existingOrder = await prisma.orders.findFirst({
            where: { call_id: call.id },
          });

          let order;
          if (existingOrder) {
            order = await prisma.orders.update({
              where: { id: existingOrder.id },
              data: {
                notes,
                subtotal,
                tax,
                total,
                pickup_time: pickupTime,
                order_type: orderType,
                delivery_address: deliveryAddress,
              },
            });
            console.log(
              `CloudPRNT: Order ${order.id} updated during tool-calls`,
            );
          } else {
            const orderCount = await prisma.orders.count({
              where: { restaurant_id: restaurantId },
            });
            const orderNumber = String(orderCount + 1);

            order = await prisma.orders.create({
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
                order_type: orderType,
                delivery_address: deliveryAddress,
              },
            });

            // Increment customer total orders count
            await prisma.customers.update({
              where: { id: customer.id },
              data: { total_orders: { increment: 1 } },
            });

            console.log(
              `CloudPRNT: Order ${order.id} created during tool-calls`,
            );

            // Check if Stripe is configured for this restaurant
            const restaurantInfo = await prisma.restaurants.findUnique({
              where: { id: restaurantId },
              select: { stripe_secret_key: true },
            });
            const hasStripe = !!restaurantInfo?.stripe_secret_key;

            if (!hasStripe) {
              // Automatically queue print jobs for any registered printers immediately (cash order)
              await queuePrintJobs(restaurantId, order.id);
            }
          }

          // Generate/update Stripe payment link and send SMS (async)
          generateAndSendPaymentLink(order.id).catch((err) => {
            console.error("Error in generateAndSendPaymentLink:", err);
          });

          results.push({
            toolCallId: tc.id,
            result: "Order saved successfully.",
          });
        }
      } catch (err) {
        console.error("Error saving order from tool call:", err);
        results.push({
          toolCallId: tc.id,
          error: "Failed to save order.",
        });
      }
    } else {
      // Return default success result for other tools to prevent Vapi throwing error
      results.push({
        toolCallId: tc.id,
        result: "Success",
      });
    }
  }

  return { results };
};

const queuePrintJobs = async (restaurantId, orderId) => {
  try {
    const printers = await prisma.printers.findMany({
      where: { restaurant_id: restaurantId },
    });

    for (const printer of printers) {
      const existingJob = await prisma.print_jobs.findFirst({
        where: { printer_id: printer.id, order_id: orderId },
      });
      if (!existingJob) {
        await prisma.print_jobs.create({
          data: {
            printer_id: printer.id,
            order_id: orderId,
            status: "pending",
            retry_count: 0,
          },
        });
        console.log(
          `CloudPRNT: Queued print job for printer ${printer.id} (Order ${orderId})`,
        );
      }
    }
  } catch (printError) {
    console.error("CloudPRNT: Error queueing print job:", printError);
  }
};

const generateAndSendPaymentLink = async (orderId) => {
  try {
    const existingPayment = await prisma.payments.findFirst({
      where: { order_id: orderId },
    });

    if (existingPayment) {
      console.log(`Payment link already generated for order ${orderId}`);
      return;
    }

    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        call: {
          include: {
            agent: {
              select: {
                twilio_number: true,
              },
            },
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            stripe_secret_key: true,
            settings: {
              select: {
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      console.error(`Order ${orderId} not found for payment link generation`);
      return;
    }

    const { restaurant, customer } = order;
    const customerPhone = customer?.phone;

    if (!customerPhone || customerPhone.toLowerCase() === "unknown") {
      console.warn(
        `Customer phone is unknown for order ${orderId}. Cannot send payment link.`,
      );
      return;
    }

    let paymentLink = "";
    let stripeSessionId = "";

    if (restaurant.stripe_secret_key) {
      try {
        const stripeInstance = new Stripe(restaurant.stripe_secret_key);
        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
        const successUrl = `${backendUrl}/api/webhook/payment/verify?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`;
        const cancelUrl = `${backendUrl}/api/webhook/payment/verify?session_id=failed&order_id=${order.id}`;
        const currency = restaurant.settings?.currency || "usd";

        const session = await stripeInstance.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                  name: `Order #${order.order_number} - ${restaurant.name}`,
                },
                unit_amount: Math.round(order.total * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            orderId: order.id,
            restaurantId: restaurant.id,
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        });

        paymentLink = session.url;
        stripeSessionId = session.id;

        // Save payment session details in DB
        await prisma.payments.create({
          data: {
            order_id: order.id,
            stripe_payment_intent: stripeSessionId,
            payment_link: paymentLink,
            amount: order.total,
            status: "pending",
          },
        });

        console.log(
          `Stripe Checkout Session created for order ${orderId}: ${paymentLink}`,
        );
      } catch (stripeError) {
        console.error(
          `Failed to create Stripe Checkout Session for restaurant ${restaurant.id}:`,
          stripeError.message,
        );
      }
    } else {
      console.warn(
        `Restaurant ${restaurant.id} does not have Stripe keys configured. Payment link generation skipped.`,
      );
    }

    // Send SMS with link or cash message
    let messageBody = "";
    if (paymentLink) {
      messageBody = `Thank you for ordering from ${restaurant.name}! Your order total is $${order.total.toFixed(2)}. Please pay here to confirm your order: ${paymentLink}`;
    } else {
      messageBody = `Thank you for ordering from ${restaurant.name}! Your order total is $${order.total.toFixed(2)}. (Pay in cash upon pickup/delivery)`;
    }

    // Use agent's specific Twilio number if available, otherwise default to config
    const agentTwilioNumber = order.call?.agent?.twilio_number;
    const senderNumber =
      agentTwilioNumber &&
      agentTwilioNumber !== "TBD" &&
      agentTwilioNumber !== ""
        ? agentTwilioNumber.startsWith("+")
          ? agentTwilioNumber
          : `+${agentTwilioNumber}`
        : null;

    const smsResult = await sendSms(customerPhone, messageBody, senderNumber);

    // Log SMS in DB
    await prisma.sms_logs.create({
      data: {
        restaurant_id: restaurant.id,
        customer_id: customer.id,
        order_id: order.id,
        phone: customerPhone,
        message: messageBody,
        status: smsResult.success ? "sent" : "failed",
      },
    });
  } catch (err) {
    console.error(
      `Error in generateAndSendPaymentLink for order ${orderId}:`,
      err,
    );
  }
};

const verifyCustomerPaymentInDB = async (orderId, sessionId) => {
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    include: {
      restaurant: {
        select: {
          id: true,
          stripe_secret_key: true,
        },
      },
    },
  });

  if (!order) {
    throw new DevBuildError("Order not found", StatusCodes.NOT_FOUND);
  }

  if (!order.restaurant.stripe_secret_key) {
    throw new DevBuildError(
      "Restaurant Stripe keys not configured",
      StatusCodes.BAD_REQUEST,
    );
  }

  const stripeInstance = new Stripe(order.restaurant.stripe_secret_key);
  const session = await stripeInstance.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    throw new DevBuildError(
      "Payment has not been completed yet",
      StatusCodes.BAD_REQUEST,
    );
  }

  await prisma.$transaction(async (tx) => {
    // Update order
    await tx.orders.update({
      where: { id: orderId },
      data: {
        order_status: "preparing",
        payment_status: "paid",
      },
    });

    // Update or create payment record
    const payment = await tx.payments.findFirst({
      where: { order_id: orderId },
    });

    if (payment) {
      await tx.payments.update({
        where: { id: payment.id },
        data: {
          stripe_payment_intent: session.payment_intent || session.id,
          status: "paid",
          paid_at: new Date(),
        },
      });
    } else {
      await tx.payments.create({
        data: {
          order_id: orderId,
          stripe_payment_intent: session.payment_intent || session.id,
          payment_link: session.url || "",
          amount: order.total,
          status: "paid",
          paid_at: new Date(),
        },
      });
    }
  });

  // Queue printing since order is now paid
  await queuePrintJobs(order.restaurant.id, orderId);

  return {
    orderId,
    status: "paid",
    orderStatus: "preparing",
    orderNumber: order.order_number,
  };
};

export const WebhookService = {
  saveCallFromWebhook,
  processToolCalls,
  verifyCustomerPaymentInDB,
};
