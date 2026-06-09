import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { envVars } from "../../../config/env.js";

const getCallHistoryFromVapi = async ({ userId, agentId }) => {
  // 1. Find the restaurant associated with the logged-in user
  const userRestaurant = await prisma.user_restaurant.findFirst({
    where: { user_id: userId },
  });

  if (!userRestaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND,
    );
  }

  const restaurantId = userRestaurant.restaurant_id;

  // 2. Find agents belonging to this restaurant
  const queryCondition = { restaurant_id: restaurantId };
  if (agentId) {
    queryCondition.id = agentId;
  }

  const agents = await prisma.agents.findMany({
    where: queryCondition,
  });

  if (agents.length === 0) {
    if (agentId) {
      throw new DevBuildError(
        "Agent not found or unauthorized",
        StatusCodes.NOT_FOUND,
      );
    }
    return [];
  }

  // 3. Fetch call logs from the database
  const agentIds = agents.map((agent) => agent.id);
  const dbCalls = await prisma.calls.findMany({
    where: {
      agent_id: { in: agentIds },
    },
    include: {
      customer: {
        select: {
          phone: true,
        },
      },
      agent: {
        select: {
          agent_name: true,
        },
      },
    },
    orderBy: {
      start_time: "desc",
    },
  });

  // 4. Format results to match the UI requirements shown in the image
  const formattedCalls = dbCalls.map((call) => {
    // Determine TYPE
    const type = call.type ? call.type.toUpperCase() : "OUTBOUND";

    // Agent Name
    const agentName = call.agent?.agent_name || "Unknown";

    // Customer Phone Number
    const phone = call.customer?.phone || "Unknown";

    // Started At formatted (e.g., 6/9/2026, 12:23:21 PM)
    const startedAt = call.start_time
      ? new Date(call.start_time).toLocaleString("en-US", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: true,
        })
      : "Unknown";

    // Status (ended, ongoing, etc.)
    const status = call.status || "ended";

    // Duration in seconds
    const durationVal = typeof call.duration === "number" ? call.duration : 0;
    const duration = `${durationVal}s`;

    // Cost formatted (estimation based on standard VAPI rates: $0.00086 / second)
    const costVal = durationVal * 0.00086;
    const cost = `$${costVal.toFixed(4)}`;

    // Transcript
    const transcript = call.transcript || "";

    // Audio recording URL
    const recordingUrl = call.recording_url || "";

    return {
      id: call.id,
      type,
      agentName,
      phone,
      startedAt,
      status,
      duration,
      cost,
      recordingUrl,
      transcript,
    };
  });

  return formattedCalls;
};

export const CallHistoryService = {
  getCallHistoryFromVapi,
};
