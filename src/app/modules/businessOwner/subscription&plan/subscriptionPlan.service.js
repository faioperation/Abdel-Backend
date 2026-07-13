import DevBuildError from "../../../lib/DevBuildError.js";
import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";

const getAllPlans = async (prisma, user) => {
  const plans = await prisma.plans.findMany({
    orderBy: {
      monthly_price: "asc",
    },
  });

  if (!user) {
    return plans.map((plan) => ({
      ...plan,
      isPurchased: false,
      isCurrentPlan: false,
    }));
  }

  // Find restaurant owned by this user
  const restaurant = await prisma.restaurants.findFirst({
    where: { owner_id: user.id },
  });

  let activeSub = null;
  if (restaurant) {
    activeSub = await prisma.subscriptions.findFirst({
      where: {
        restaurant_id: restaurant.id,
        status: "active",
      },
    });
  }

  return plans.map((plan) => ({
    ...plan,
    isPurchased: activeSub ? activeSub.plan_id === plan.id : false,
    isCurrentPlan: activeSub ? activeSub.plan_id === plan.id : false,
    includedMinutes: plan.included_minutes,
    overageRate: plan.overage_rate,
  }));
};

const getBillingHistory = async (prisma, user, query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const skip = (page - 1) * limit;

  // Find restaurant owned by this user
  const restaurant = await prisma.restaurants.findFirst({
    where: { owner_id: user.id },
  });

  if (!restaurant) {
    return {
      meta: { page, limit, total: 0, totalPages: 0 },
      data: [],
    };
  }

  // Count total subscriptions
  const total = await prisma.subscriptions.count({
    where: { restaurant_id: restaurant.id },
  });

  // Fetch subscriptions with pagination, ordered by start_date descending
  const subscriptions = await prisma.subscriptions.findMany({
    where: { restaurant_id: restaurant.id },
    include: { plan: true },
    orderBy: { start_date: "desc" },
    skip,
    take: limit,
  });

  // Helper function to format date as MM/DD/YYYY
  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const mappedData = subscriptions.map((sub) => {
    // Determine billing cycle by comparing start_date and end_date
    const diffTime = Math.abs(
      new Date(sub.end_date) - new Date(sub.start_date),
    );
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isYearly = diffDays > 300;
    const cycle = isYearly ? "yearly" : "monthly";

    // Set correct price
    const amount = isYearly ? sub.plan.yearly_price : sub.plan.monthly_price;

    return {
      id: sub.id,
      date: formatDate(sub.start_date),
      details: `${sub.plan.name} plan, ${cycle}`,
      amount: `$${amount.toFixed(2)}`,
      status: sub.status,
    };
  });

  const totalPages = Math.ceil(total / limit);

  return {
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
    data: mappedData,
  };
};

const getMySubscription = async (prisma, user) => {
  // Find restaurant owned by this user
  const restaurant = await prisma.restaurants.findFirst({
    where: { owner_id: user.id },
  });

  if (!restaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND
    );
  }

  // Find active subscription
  const activeSub = await prisma.subscriptions.findFirst({
    where: {
      restaurant_id: restaurant.id,
      status: "active",
    },
    include: {
      plan: true,
    },
  });

  if (!activeSub) {
    return {
      hasActiveSubscription: false,
      restaurantStatus: restaurant.status,
      subscription: null,
    };
  }

  // Find the latest usage log for this billing cycle
  const usage = await prisma.subscription_usage.findFirst({
    where: {
      subscription_id: activeSub.id,
      current_month: {
        gte: activeSub.start_date,
        lte: activeSub.end_date,
      },
    },
    orderBy: {
      current_month: "desc",
    },
  });

  const totalCalls = usage ? usage.total_calls : 0;
  const totalOrders = usage ? usage.total_orders : 0;
  const totalDurationSeconds = usage ? usage.total_duration : 0;

  // Usage minutes rounded up
  const usedMinutes = Math.ceil(totalDurationSeconds / 60);
  const includedMinutes = activeSub.plan.included_minutes || 0;
  const overageRate = activeSub.plan.overage_rate || 0.0;

  const overageMinutes = Math.max(0, usedMinutes - includedMinutes);
  const remainingMinutes = Math.max(0, includedMinutes - usedMinutes);
  const accruedOverageCost = overageMinutes * overageRate;

  return {
    hasActiveSubscription: true,
    restaurantStatus: restaurant.status,
    subscription: {
      id: activeSub.id,
      planName: activeSub.plan.name,
      monthlyPrice: activeSub.plan.monthly_price,
      currency: "DKK",
      startDate: activeSub.start_date,
      endDate: activeSub.end_date,
      stripeSubscriptionId: activeSub.stripe_subscription_id,
      usage: {
        totalCalls,
        totalOrders,
        totalDurationSeconds,
        usedMinutes,
        includedMinutes,
        remainingMinutes,
        overageMinutes,
        overageRate,
        accruedOverageCost,
      },
    },
  };
};

const incrementSubscriptionUsage = async (
  restaurantId,
  durationSeconds = 0,
  incrementCalls = false,
  incrementOrders = false,
) => {
  try {
    const activeSubscription = await prisma.subscriptions.findFirst({
      where: {
        restaurant_id: restaurantId,
        status: "active",
      },
    });

    if (activeSubscription) {
      let usage = await prisma.subscription_usage.findFirst({
        where: {
          subscription_id: activeSubscription.id,
          current_month: {
            gte: activeSubscription.start_date,
            lte: activeSubscription.end_date,
          },
        },
        orderBy: {
          current_month: "desc",
        },
      });

      if (!usage) {
        usage = await prisma.subscription_usage.create({
          data: {
            subscription_id: activeSubscription.id,
            total_calls: 0,
            total_orders: 0,
            total_duration: 0,
            current_month: activeSubscription.start_date,
          },
        });
      }

      await prisma.subscription_usage.update({
        where: { id: usage.id },
        data: {
          total_calls: incrementCalls ? { increment: 1 } : undefined,
          total_orders: incrementOrders ? { increment: 1 } : undefined,
          total_duration:
            durationSeconds > 0 ? { increment: durationSeconds } : undefined,
        },
      });
      console.log(
        `Updated subscription usage for Restaurant ${restaurantId}: calls=${incrementCalls}, orders=${incrementOrders}, durationSeconds=${durationSeconds}`,
      );
    }
  } catch (error) {
    console.error("Error updating subscription usage:", error);
  }
};

export const SubscriptionPlanService = {
  getAllPlans,
  getBillingHistory,
  getMySubscription,
  incrementSubscriptionUsage,
};
