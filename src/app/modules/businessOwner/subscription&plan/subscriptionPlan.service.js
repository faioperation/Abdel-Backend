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

export const SubscriptionPlanService = {
  getAllPlans,
  getBillingHistory,
};
