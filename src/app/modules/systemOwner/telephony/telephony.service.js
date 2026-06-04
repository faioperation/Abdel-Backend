import prisma from "../../../prisma/client.js";

// Fetch all telephony numbers/agents from database
const getAllTelephonyFromDB = async () => {
  return await prisma.agent.findMany({
    select: {
      id: true,
      twilioNumber: true,
      managerNumber: true,
      vapiAgentId: true,
      business: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      twilioNumber: "asc",
    },
  });
};

// Fetch a single telephony/agent entry by ID
const getTelephonyByIdFromDB = async (id) => {
  return await prisma.agent.findUnique({
    where: { id },
    select: {
      id: true,
      twilioNumber: true,
      managerNumber: true,
      vapiAgentId: true,
      business: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
};

// Create (or rather, link and update) a telephony/agent configuration in database
const createTelephonyInDB = async (payload) => {
  const { twilioNumber, managerNumber, vapiAgentId } = payload;

  const existingAgent = await prisma.agent.findUnique({
    where: { vapiAgentId },
  });

  if (!existingAgent) {
    return null;
  }

  // Check if numbers are already configured (i.e., not the placeholder "TBD")
  const isTwilioConfigured =
    existingAgent.twilioNumber &&
    existingAgent.twilioNumber !== "TBD" &&
    existingAgent.twilioNumber !== "";
  const isManagerConfigured =
    existingAgent.managerNumber &&
    existingAgent.managerNumber !== "TBD" &&
    existingAgent.managerNumber !== "";

  if (isTwilioConfigured && isManagerConfigured) {
    return "ALREADY_EXISTS";
  }

  return await prisma.agent.update({
    where: { id: existingAgent.id },
    data: {
      twilioNumber,
      managerNumber,
    },
    select: {
      id: true,
      twilioNumber: true,
      managerNumber: true,
      vapiAgentId: true,
    },
  });
};

// Update an existing telephony/agent configuration in database
const updateTelephonyInDB = async (id, payload) => {
  const { twilioNumber, managerNumber } = payload;

  const updateData = {};
  if (twilioNumber !== undefined) updateData.twilioNumber = twilioNumber;
  if (managerNumber !== undefined) updateData.managerNumber = managerNumber;

  return await prisma.agent.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      twilioNumber: true,
      managerNumber: true,
      vapiAgentId: true,
    },
  });
};

// Reset a telephony/agent configuration to defaults in database (delete equivalent)
const deleteTelephonyFromDB = async (id) => {
  return await prisma.agent.update({
    where: { id },
    data: {
      twilioNumber: "TBD",
      managerNumber: "TBD",
    },
    select: {
      id: true,
      twilioNumber: true,
      managerNumber: true,
      vapiAgentId: true,
    },
  });
};

export const TelephonyService = {
  getAllTelephonyFromDB,
  getTelephonyByIdFromDB,
  createTelephonyInDB,
  updateTelephonyInDB,
  deleteTelephonyFromDB,
};
