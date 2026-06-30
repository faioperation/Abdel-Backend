import Stripe from "stripe";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { StatusCodes } from "http-status-codes";

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
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const successUrl = `${frontendUrl}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${frontendUrl}/dashboard/subscription`;

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

      // Create new active subscription
      const newSubscription = await prisma.subscriptions.create({
        data: {
          restaurant_id: restaurantId,
          plan_id: planId,
          status: "active",
          start_date: startDate,
          end_date: endDate,
        },
      });

      // Initialize usage tracking record
      await prisma.subscription_usage.create({
        data: {
          subscription_id: newSubscription.id,
          total_calls: 0,
          total_orders: 0,
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

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    // Extract metadata or fetch subscription from Stripe to find the restaurant
    const restaurantId = subscription.metadata?.restaurantId;

    if (restaurantId) {
      await prisma.subscriptions.updateMany({
        where: { restaurant_id: restaurantId, status: "active" },
        data: { status: "canceled" },
      });

      // Update restaurant status to expired
      await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { status: "expired" },
      });

      console.log(
        `Subscription deleted/canceled for Restaurant ${restaurantId}`,
      );
    }
  }
};

export const PaymentService = {
  createStripeCheckoutSession,
  processStripeWebhook,
};
