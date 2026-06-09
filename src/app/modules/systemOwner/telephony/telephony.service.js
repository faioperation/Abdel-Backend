import prisma from "../../../prisma/client.js";

// Fetch all telephony numbers/agents from database
const getAllTelephonyFromDB = async () => {
  const agents = await prisma.agents.findMany({
    select: {
      id: true,
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
    twilioNumber: agent.twilio_number,
    managerNumber: agent.manager_number,
    vapiAgentId: agent.vapi_assistant_id,
    business: agent.restaurant,
  };
};

// Create (or rather, link and update) a telephony/agent configuration in database
const createTelephonyInDB = async (payload) => {
  const { twilioNumber, managerNumber, vapiAgentId } = payload;

  const existingAgent = await prisma.agents.findFirst({
    where: { vapi_assistant_id: vapiAgentId },
  });

  if (!existingAgent) {
    return null;
  }

  // Check if numbers are already configured (i.e., not the placeholder "TBD")
  const isTwilioConfigured =
    existingAgent.twilio_number &&
    existingAgent.twilio_number !== "TBD" &&
    existingAgent.twilio_number !== "";
  const isManagerConfigured =
    existingAgent.manager_number &&
    existingAgent.manager_number !== "TBD" &&
    existingAgent.manager_number !== "";

  if (isTwilioConfigured && isManagerConfigured) {
    return "ALREADY_EXISTS";
  }

  const updatedAgent = await prisma.agents.update({
    where: { id: existingAgent.id },
    data: {
      twilio_number: twilioNumber,
      manager_number: managerNumber,
    },
    select: {
      id: true,
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
    },
  });

  return {
    id: updatedAgent.id,
    twilioNumber: updatedAgent.twilio_number,
    managerNumber: updatedAgent.manager_number,
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
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
    },
  });

  return {
    id: updatedAgent.id,
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
      twilio_number: true,
      manager_number: true,
      vapi_assistant_id: true,
    },
  });

  return {
    id: updatedAgent.id,
    twilioNumber: updatedAgent.twilio_number,
    managerNumber: updatedAgent.manager_number,
    vapiAgentId: updatedAgent.vapi_assistant_id,
  };
};

export const TelephonyService = {
  getAllTelephonyFromDB,
  getTelephonyByIdFromDB,
  createTelephonyInDB,
  updateTelephonyInDB,
  deleteTelephonyFromDB,
};
