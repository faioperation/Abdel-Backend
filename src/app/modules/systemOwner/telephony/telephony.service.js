import prisma from "../../../prisma/client.js";
import { envVars } from "../../../config/env.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { StatusCodes } from "http-status-codes";

// Fetch all telephony numbers/agents from database
const getAllTelephonyFromDB = async () => {
  const agents = await prisma.agents.findMany({
    select: {
      id: true,
      agent_name: true,
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
      restaurant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      twilio_number: "asc",
    },
  });

  return agents.map((agent) => ({
    id: agent.id,
    agentName: agent.agent_name,
    twilioNumber: agent.twilio_number,
    managerNumber: agent.manager_number,
    vapiAgentId: agent.vapi_assistant_id,
    business: agent.restaurant,
  }));
};

// Fetch a single telephony/agent entry by ID
const getTelephonyByIdFromDB = async (id) => {
  const agent = await prisma.agents.findUnique({
    where: { id },
    select: {
      id: true,
      agent_name: true,
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
      restaurant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!agent) return null;

  return {
    id: agent.id,
    agentName: agent.agent_name,
    twilioNumber: agent.twilio_number,
    managerNumber: agent.manager_number,
    vapiAgentId: agent.vapi_assistant_id,
    business: agent.restaurant,
  };
};

// Create (or rather, link and update) a telephony/agent configuration in database
const createTelephonyInDB = async (payload) => {
  const { twilioNumber, vapiAgentId, businessId } = payload;

  const existingAgent = await prisma.agents.findFirst({
    where: {
      vapi_assistant_id: vapiAgentId,
      restaurant_id: businessId,
    },
  });

  if (!existingAgent) {
    return null;
  }

  // Check if twilioNumber is already configured (i.e., not the placeholder "TBD")
  const isTwilioConfigured =
    existingAgent.twilio_number &&
    existingAgent.twilio_number !== "TBD" &&
    existingAgent.twilio_number !== "";

  if (isTwilioConfigured) {
    return "ALREADY_EXISTS";
  }

  // Check if twilioNumber is already assigned to another agent
  const twilioNumberInUse = await prisma.agents.findFirst({
    where: {
      twilio_number: twilioNumber,
      NOT: {
        id: existingAgent.id,
      },
    },
  });

  if (twilioNumberInUse) {
    return "NUMBER_IN_USE";
  }

  // Call external AI Service to link the Twilio number to the assistant
  const aiUrl = `${envVars.AI_SERVICE_URL}/assistant/link-number?assistant_id=${vapiAgentId}`;
  try {
    const aiResponse = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        twilio_number: twilioNumber,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new DevBuildError(
        `Failed to link number on AI Service: ${errorText}`,
        aiResponse.status || StatusCodes.BAD_GATEWAY,
      );
    }
  } catch (err) {
    if (err instanceof DevBuildError) throw err;
    throw new DevBuildError(
      `Failed to contact AI service: ${err.message}`,
      StatusCodes.BAD_GATEWAY,
    );
  }

  const updatedAgent = await prisma.agents.update({
    where: { id: existingAgent.id },
    data: {
      twilio_number: twilioNumber,
    },
    select: {
      id: true,
      agent_name: true,
      twilio_number: true,
      vapi_assistant_id: true,
    },
  });

  return {
    id: updatedAgent.id,
    agentName: updatedAgent.agent_name,
    twilioNumber: updatedAgent.twilio_number,
    vapiAgentId: updatedAgent.vapi_assistant_id,
  };
};

// Update an existing telephony/agent configuration in database
const updateTelephonyInDB = async (id, payload) => {
  const { twilioNumber, managerNumber } = payload;

  const updateData = {};
  if (twilioNumber !== undefined) updateData.twilio_number = twilioNumber;
  if (managerNumber !== undefined) updateData.manager_number = managerNumber;

  const updatedAgent = await prisma.agents.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      agent_name: true,
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
    },
  });

  return {
    id: updatedAgent.id,
    agentName: updatedAgent.agent_name,
    twilioNumber: updatedAgent.twilio_number,
    managerNumber: updatedAgent.manager_number,
    vapiAgentId: updatedAgent.vapi_assistant_id,
  };
};

// Reset a telephony/agent configuration to defaults in database (delete equivalent)
const deleteTelephonyFromDB = async (id) => {
  const updatedAgent = await prisma.agents.update({
    where: { id },
    data: {
      twilio_number: "TBD",
      manager_number: "TBD",
    },
    select: {
      id: true,
      agent_name: true,
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
    },
  });

  return {
    id: updatedAgent.id,
    agentName: updatedAgent.agent_name,
    twilioNumber: updatedAgent.twilio_number,
    managerNumber: updatedAgent.manager_number,
    vapiAgentId: updatedAgent.vapi_assistant_id,
  };
};

// Fetch all unconnected agents belonging to a specific business/restaurant
const getUnconnectedAgentsByBusinessFromDB = async (businessId) => {
  const agents = await prisma.agents.findMany({
    where: {
      restaurant_id: businessId,
      OR: [
        { twilio_number: "TBD" },
        { twilio_number: "" },
        { manager_number: "TBD" },
        { manager_number: "" },
      ],
    },
    select: {
      id: true,
      agent_name: true,
      vapi_assistant_id: true,
      twilio_number: true,
      manager_number: true,
    },
  });

  return agents.map((agent) => ({
    id: agent.id,
    agentName: agent.agent_name,
    vapiAgentId: agent.vapi_assistant_id,
    twilioNumber: agent.twilio_number,
    managerNumber: agent.manager_number,
  }));
};

export const TelephonyService = {
  getAllTelephonyFromDB,
  getTelephonyByIdFromDB,
  createTelephonyInDB,
  updateTelephonyInDB,
  deleteTelephonyFromDB,
  getUnconnectedAgentsByBusinessFromDB,
};
