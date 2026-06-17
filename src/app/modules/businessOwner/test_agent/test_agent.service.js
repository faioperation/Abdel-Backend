import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { envVars } from "../../../config/env.js";

const getUserRestaurantId = async (userId) => {
  const userRestaurant = await prisma.user_restaurant.findFirst({
    where: { user_id: userId },
  });

  if (!userRestaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND,
    );
  }

  return userRestaurant.restaurant_id;
};

const getCallableAgents = async ({ userId }) => {
  const restaurantId = await getUserRestaurantId(userId);

  const agents = await prisma.agents.findMany({
    where: {
      restaurant_id: restaurantId,
      status: "active",
      vapi_assistant_id: { not: "" },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      agent_name: true,
      vapi_assistant_id: true,
      status: true,
    },
  });

  return agents.map((agent) => ({
    id: agent.id,
    agentName: agent.agent_name,
    vapiAssistantId: agent.vapi_assistant_id,
    status: agent.status,
  }));
};

const getCallConfig = async ({ userId, agentId }) => {
  const restaurantId = await getUserRestaurantId(userId);

  const agent = await prisma.agents.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      agent_name: true,
      restaurant_id: true,
      vapi_assistant_id: true,
      status: true,
    },
  });

  if (!agent) {
    throw new DevBuildError("Agent not found", StatusCodes.NOT_FOUND);
  }

  if (agent.restaurant_id !== restaurantId) {
    throw new DevBuildError(
      "You are not authorized to call this agent",
      StatusCodes.FORBIDDEN,
    );
  }

  if (agent.status !== "active") {
    throw new DevBuildError(
      "This agent is inactive and cannot be called",
      StatusCodes.BAD_REQUEST,
    );
  }

  if (!agent.vapi_assistant_id) {
    throw new DevBuildError(
      "This agent is not linked to a Vapi assistant",
      StatusCodes.BAD_REQUEST,
    );
  }

  return {
    agentId: agent.id,
    agentName: agent.agent_name,
    vapiAssistantId: agent.vapi_assistant_id,
    vapiPublicKey: envVars.VAPI_PUBLIC_KEY,
  };
};

export const TestAgentService = {
  getCallableAgents,
  getCallConfig,
};
