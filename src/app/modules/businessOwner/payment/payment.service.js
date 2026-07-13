import Stripe from "stripe";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { StatusCodes } from "http-status-codes";
import { sendSms } from "../../../utils/sendSms.js";
import { PrinterService } from "../printer/printer.service.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const createStripeCheckoutSession = async (user, planId, billingCycle) => {
  // Find restaurant owned by the user
  const restaurant = await prisma.restaurants.findFirst({
    where: { owner_id: user.id },
  });

  if (!restaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND,
    );
  }

  // Find the plan
  const plan = await prisma.plans.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new DevBuildError("Plan not found", StatusCodes.NOT_FOUND);
  }

  // Prevent multiple Free Trial subscriptions
  if (/free tra[il]/i.test(plan.name)) {
    const hasExistingFreeTrial = await prisma.subscriptions.findFirst({
      where: {
        restaurant_id: restaurant.id,
        plan: {
          name: {
            startsWith: "Free Tra",
            mode: "insensitive",
          },
        },
      },
    });

    if (hasExistingFreeTrial) {
      throw new DevBuildError(
        "You have already used your Free Trial. Please select a paid plan.",
        StatusCodes.BAD_REQUEST,
      );
    }
  }

  // Determine Stripe Price ID
  const priceId =
    billingCycle === "yearly"
      ? plan.stripe_yearly_price_id
      : plan.stripe_monthly_price_id;

  if (!priceId) {
    throw new DevBuildError(
      `Stripe price ID for ${billingCycle} is not configured for this plan`,
      StatusCodes.INTERNAL_SERVER_ERROR,
    );
  }

  // Frontend Success/Cancel URLs
  const frontendUrl = process.env.FRONT_END_URL || process.env.FRONTEND_URL || "http://localhost:3000";
  const successUrl = `${frontendUrl}/owner/subscription?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${frontendUrl}/owner/subscription`;

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    client_reference_id: restaurant.id,
    customer_email: user.email,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      restaurantId: restaurant.id,
      planId: plan.id,
      billingCycle: billingCycle,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return { url: session.url };
};

const processStripeWebhook = async (event) => {
  console.log(`Received Webhook Event: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const restaurantId =
      session.metadata?.restaurantId || session.client_reference_id;
    const planId = session.metadata?.planId;
    const billingCycle = session.metadata?.billingCycle || "monthly";

    if (restaurantId && planId) {
      // Deactivate any existing active subscriptions for this restaurant
      await prisma.subscriptions.updateMany({
        where: { restaurant_id: restaurantId, status: "active" },
        data: { status: "canceled" },
      });

      // Calculate end date based on billing cycle
      const startDate = new Date();
      const endDate = new Date(startDate);
      if (billingCycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      // Create new active subscription with Stripe IDs
      const newSubscription = await prisma.subscriptions.create({
        data: {
          restaurant_id: restaurantId,
          plan_id: planId,
          status: "active",
          start_date: startDate,
          end_date: endDate,
          stripe_subscription_id: session.subscription || null,
          stripe_customer_id: session.customer || null,
        },
      });

      // Initialize usage tracking record
      await prisma.subscription_usage.create({
        data: {
          subscription_id: newSubscription.id,
          total_calls: 0,
          total_orders: 0,
          total_duration: 0,
        },
      });

      // Set restaurant status to active
      await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { status: "active" },
      });

      console.log(
        `Subscription created successfully for Restaurant ${restaurantId} with Plan ${planId}`,
      );
    }
  }

  if (event.type === "invoice.created") {
    const invoice = event.data.object;
    if (invoice.subscription) {
      const dbSubscription = await prisma.subscriptions.findFirst({
        where: { stripe_subscription_id: invoice.subscription },
        include: { plan: true },
      });

      if (dbSubscription) {
        // Find the latest usage log for this subscription
        const latestUsage = await prisma.subscription_usage.findFirst({
          where: { subscription_id: dbSubscription.id },
          orderBy: { current_month: "desc" },
        });

        if (latestUsage) {
          const usedSeconds = latestUsage.total_duration || 0;
          const usedMinutes = Math.ceil(usedSeconds / 60);
          const includedMinutes = dbSubscription.plan.included_minutes || 0;

          if (usedMinutes > includedMinutes) {
            const overageMinutes = usedMinutes - includedMinutes;
            const overageRate = dbSubscription.plan.overage_rate || 0.0;
            const overageAmount = overageMinutes * overageRate;

            if (overageAmount > 0) {
              await stripe.invoiceItems.create({
                customer: invoice.customer,
                subscription: invoice.subscription,
                invoice: invoice.id,
                amount: Math.round(overageAmount * 100), // in cents/øre
                currency: "dkk",
                description: `Overage charges: ${overageMinutes} additional minutes @ ${overageRate.toFixed(2)} DKK/min`,
              });
              console.log(
                `Created overage invoice item of DKK ${overageAmount} for Subscription ${dbSubscription.id} (Overage: ${overageMinutes} mins)`
              );
            }
          }
        }
      }
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    if (invoice.subscription) {
      const dbSubscription = await prisma.subscriptions.findFirst({
        where: { stripe_subscription_id: invoice.subscription },
      });

      if (dbSubscription) {
        const lineItem = invoice.lines?.data?.[0];
        const newStartDate = lineItem?.period?.start
          ? new Date(lineItem.period.start * 1000)
          : new Date();
        const newEndDate = lineItem?.period?.end
          ? new Date(lineItem.period.end * 1000)
          : new Date(newStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        await prisma.subscriptions.update({
          where: { id: dbSubscription.id },
          data: {
            status: "active",
            start_date: newStartDate,
            end_date: newEndDate,
          },
        });

        const existingUsage = await prisma.subscription_usage.findFirst({
          where: {
            subscription_id: dbSubscription.id,
            current_month: {
              gte: new Date(newStartDate.getTime() - 1000),
              lte: new Date(newStartDate.getTime() + 1000),
            },
          },
        });

        if (!existingUsage) {
          await prisma.subscription_usage.create({
            data: {
              subscription_id: dbSubscription.id,
              total_calls: 0,
              total_orders: 0,
              total_duration: 0,
              current_month: newStartDate,
            },
          });
          console.log(`Initialized new usage cycle for Subscription ${dbSubscription.id}`);
        } else {
          console.log(`Usage cycle already initialized for Subscription ${dbSubscription.id}`);
        }
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const restaurantId = subscription.metadata?.restaurantId;

    if (restaurantId || subscription.id) {
      const query = {};
      if (subscription.id) {
        query.stripe_subscription_id = subscription.id;
      } else {
        query.restaurant_id = restaurantId;
        query.status = "active";
      }

      const dbSubscription = await prisma.subscriptions.findFirst({
        where: query,
      });

      const actualRestaurantId = dbSubscription ? dbSubscription.restaurant_id : restaurantId;

      if (actualRestaurantId) {
        await prisma.subscriptions.updateMany({
          where: { restaurant_id: actualRestaurantId, status: "active" },
          data: { status: "canceled" },
        });

        // Update restaurant status to expired
        await prisma.restaurants.update({
          where: { id: actualRestaurantId },
          data: { status: "expired" },
        });

        console.log(
          `Subscription deleted/canceled for Restaurant ${actualRestaurantId}`,
        );
      }
    }
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

const verifyCustomerPayment = async (orderId, sessionId) => {
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
  await PrinterService.queuePrintJobsForOrder(order.restaurant.id, orderId);

  return {
    orderId,
    status: "paid",
    orderStatus: "preparing",
    orderNumber: order.order_number,
  };
};

export const PaymentService = {
  createStripeCheckoutSession,
  processStripeWebhook,
  generateAndSendPaymentLink,
  verifyCustomerPayment,
};
