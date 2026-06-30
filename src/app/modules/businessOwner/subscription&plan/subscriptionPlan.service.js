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
  }));
};

export const SubscriptionPlanService = {
  getAllPlans,
};
