import prisma from "../../../prisma/client.js";

const getTenantUsageFromDB = async () => {
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

export const DashboardService = {
  getTenantUsageFromDB,
};
