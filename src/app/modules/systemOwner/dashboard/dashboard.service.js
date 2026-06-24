import prisma from "../../../prisma/client.js";

const getTenantUsageFromDB = async (monthStr) => {
  // Determine if we need to filter by date range
  let dateFilter = undefined;

  if (monthStr !== "all") {
    let start, end;
    if (monthStr) {
      // Parse YYYY-MM
      const parts = monthStr.split("-");
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // 0-based month
        if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
          start = new Date(year, month, 1);
          end = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }
      }
    }

    // Default to current month if not specified or invalid
    if (!start || !end) {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    dateFilter = {
      gte: start,
      lte: end,
    };
  }

  // 1. Fetch all restaurants (tenants)
  const tenants = await prisma.restaurants.findMany({
    include: {
      owner: {
        select: {
          email: true,
        },
      },
      agents: {
        select: {
          id: true,
          agent_name: true,
          status: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  // 2. Fetch call duration sums grouped by restaurant (tenant)
  const restaurantCallStats = await prisma.calls.groupBy({
    by: ["restaurant_id"],
    where: dateFilter ? {
      created_at: dateFilter,
    } : {},
    _sum: {
      duration: true,
    },
  });

  // Create a map of restaurant_id -> total duration in seconds
  const restaurantDurationMap = {};
  restaurantCallStats.forEach((stat) => {
    restaurantDurationMap[stat.restaurant_id] = stat._sum.duration || 0;
  });

  // 3. Fetch call duration sums grouped by agent
  const agentCallStats = await prisma.calls.groupBy({
    by: ["agent_id"],
    where: dateFilter ? {
      created_at: dateFilter,
    } : {},
    _sum: {
      duration: true,
    },
  });

  // Create a map of agent_id -> total duration in seconds
  const agentDurationMap = {};
  agentCallStats.forEach((stat) => {
    agentDurationMap[stat.agent_id] = stat._sum.duration || 0;
  });

  // 4. Format and map the response
  const formattedUsage = tenants.map((tenant) => {
    const totalUsageSeconds = restaurantDurationMap[tenant.id] || 0;
    const totalUsageMinutes = Number((totalUsageSeconds / 60).toFixed(2));

    const formattedAgents = tenant.agents.map((agent) => {
      const agentSeconds = agentDurationMap[agent.id] || 0;
      const agentMinutes = Number((agentSeconds / 60).toFixed(2));

      return {
        id: agent.id,
        name: agent.agent_name,
        status: agent.status,
        usageSeconds: agentSeconds,
        usageMinutes: agentMinutes,
      };
    });

    return {
      id: tenant.id,
      name: tenant.name,
      ownerEmail: tenant.owner?.email || null,
      status: tenant.status,
      totalUsageSeconds,
      totalUsageMinutes,
      agents: formattedAgents,
    };
  });

  return formattedUsage;
};

const getDashboardOverviewFromDB = async () => {
  const now = new Date();

  // Helper to get start of a month relative to current month
  const getStartOfMonth = (offset = 0) => {
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  };

  // Helper to get end of a month relative to current month
  const getEndOfMonth = (offset = 0) => {
    return new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  };

  const getChangeType = (val) => {
    if (val > 0) return "increase";
    if (val < 0) return "decrease";
    return "neutral";
  };

  const firstDayOfCurrentMonth = getStartOfMonth(0);
  const firstDayOfLastMonth = getStartOfMonth(-1);

  // 1. Total Tenants
  const totalTenantsCount = await prisma.restaurants.count();
  const tenantsAtStartOfCurrentMonth = await prisma.restaurants.count({
    where: {
      created_at: {
        lt: firstDayOfCurrentMonth,
      },
    },
  });
  const tenantsPercentageChange = tenantsAtStartOfCurrentMonth > 0
    ? Number((((totalTenantsCount - tenantsAtStartOfCurrentMonth) / tenantsAtStartOfCurrentMonth) * 100).toFixed(2))
    : 0;
  const tenantsAddedLastMonth = await prisma.restaurants.count({
    where: {
      created_at: {
        gte: firstDayOfLastMonth,
        lt: firstDayOfCurrentMonth,
      },
    },
  });

  const totalTenantsChart = [];
  for (let i = -5; i <= 0; i++) {
    const endOfMonth = getEndOfMonth(i);
    const count = await prisma.restaurants.count({
      where: {
        created_at: {
          lte: endOfMonth,
        },
      },
    });
    totalTenantsChart.push(count);
  }

  // 2. Active Subscriptions
  const activeSubscriptionsCount = await prisma.subscriptions.count({
    where: {
      status: "active",
    },
  });
  const activeStartBeforeThisMonth = await prisma.subscriptions.count({
    where: {
      status: "active",
      start_date: {
        lt: firstDayOfCurrentMonth,
      },
    },
  });
  const newActiveThisMonth = activeSubscriptionsCount - activeStartBeforeThisMonth;
  const activePercentageChange = activeStartBeforeThisMonth > 0
    ? Number(((newActiveThisMonth / activeStartBeforeThisMonth) * 100).toFixed(2))
    : 0;
  const activeStartedLastMonth = await prisma.subscriptions.count({
    where: {
      status: "active",
      start_date: {
        gte: firstDayOfLastMonth,
        lt: firstDayOfCurrentMonth,
      },
    },
  });

  const activeSubscriptionsChart = [];
  for (let i = -5; i <= 0; i++) {
    const startOfMonth = getStartOfMonth(i);
    const endOfMonth = getEndOfMonth(i);
    const count = await prisma.subscriptions.count({
      where: {
        start_date: {
          lte: endOfMonth,
        },
        end_date: {
          gte: startOfMonth,
        },
      },
    });
    activeSubscriptionsChart.push(count);
  }

  // 3. Monthly Revenue
  const revenueThisMonthSum = await prisma.payments.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      status: "paid",
      created_at: {
        gte: firstDayOfCurrentMonth,
      },
    },
  });
  const revenueThisMonth = revenueThisMonthSum._sum.amount || 0;

  const revenueLastMonthSum = await prisma.payments.aggregate({
    _sum: {
      amount: true,
    },
    where: {
      status: "paid",
      created_at: {
        gte: firstDayOfLastMonth,
        lt: firstDayOfCurrentMonth,
      },
    },
  });
  const revenueLastMonth = revenueLastMonthSum._sum.amount || 0;

  const revenuePercentageChange = revenueLastMonth > 0
    ? Number((((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100).toFixed(2))
    : 0;

  const monthlyRevenueChart = [];
  for (let i = -5; i <= 0; i++) {
    const startOfMonth = getStartOfMonth(i);
    const endOfMonth = getEndOfMonth(i);
    const monthlySum = await prisma.payments.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        status: "paid",
        created_at: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });
    monthlyRevenueChart.push(monthlySum._sum.amount || 0);
  }

  // 4. Expiring Tenants (Restaurants with status suspended or expired)
  const expiringTenantsCount = await prisma.restaurants.count({
    where: {
      status: {
        in: ["expired", "suspended"],
      },
    },
  });

  const expiringStartBeforeThisMonth = await prisma.restaurants.count({
    where: {
      status: {
        in: ["expired", "suspended"],
      },
      updated_at: {
        lt: firstDayOfCurrentMonth,
      },
    },
  });

  const newExpiringThisMonth = expiringTenantsCount - expiringStartBeforeThisMonth;
  const expiringPercentageChange = expiringStartBeforeThisMonth > 0
    ? Number(((newExpiringThisMonth / expiringStartBeforeThisMonth) * 100).toFixed(2))
    : 0;

  const expiringLastMonth = await prisma.restaurants.count({
    where: {
      status: {
        in: ["expired", "suspended"],
      },
      updated_at: {
        gte: firstDayOfLastMonth,
        lt: firstDayOfCurrentMonth,
      },
    },
  });

  const expiringTenantsChart = [];
  for (let i = -5; i <= 0; i++) {
    const endOfMonth = getEndOfMonth(i);
    const count = await prisma.restaurants.count({
      where: {
        status: {
          in: ["expired", "suspended"],
        },
        updated_at: {
          lte: endOfMonth,
        },
      },
    });
    expiringTenantsChart.push(count);
  }

  return {
    totalTenants: {
      count: totalTenantsCount,
      percentageChange: Math.abs(tenantsPercentageChange),
      changeType: getChangeType(tenantsPercentageChange),
      deltaLastMonth: tenantsAddedLastMonth,
      chartData: totalTenantsChart,
    },
    activeSubscriptions: {
      count: activeSubscriptionsCount,
      percentageChange: Math.abs(activePercentageChange),
      changeType: getChangeType(activePercentageChange),
      deltaLastMonth: activeStartedLastMonth,
      chartData: activeSubscriptionsChart,
    },
    monthlyRevenue: {
      count: revenueThisMonth,
      percentageChange: Math.abs(revenuePercentageChange),
      changeType: getChangeType(revenuePercentageChange),
      deltaLastMonth: Number((revenueThisMonth - revenueLastMonth).toFixed(2)),
      chartData: monthlyRevenueChart,
    },
    expiringTenants: {
      count: expiringTenantsCount,
      percentageChange: Math.abs(expiringPercentageChange),
      changeType: getChangeType(expiringPercentageChange),
      deltaLastMonth: expiringLastMonth,
      chartData: expiringTenantsChart,
    },
  };
};

export const DashboardService = {
  getTenantUsageFromDB,
  getDashboardOverviewFromDB,
};
