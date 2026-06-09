import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { envVars } from "../../../config/env.js";

const createAgentInVapiAndDB = async ({
  userId,
  assistant_name,
  welcome_message,
  file,
}) => {
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

  // 2. Prepare multipart/form-data for the external AI API
  const formData = new FormData();
  formData.append("assistant_name", assistant_name);
  if (welcome_message) {
    formData.append("welcome_message", welcome_message);
  }

  if (file) {
    const fileBlob = new Blob([file.buffer], { type: file.mimetype });
    formData.append("file", fileBlob, file.originalname);
  }

  // 3. Request the external AI API
  let response;
  try {
    response = await fetch(
      `${envVars.AI_SERVICE_URL}/create-assistant`,
      {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      },
    );
  } catch (fetchError) {
    throw new DevBuildError(
      `Failed to contact AI service: ${fetchError.message}`,
      StatusCodes.BAD_GATEWAY,
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new DevBuildError(
      `AI Service Error: ${errorText}`,
      response.status || StatusCodes.BAD_GATEWAY,
    );
  }

  const result = await response.json();
  if (!result.success || !result.assistant_id) {
    throw new DevBuildError(
      "AI service did not return a valid assistant ID",
      StatusCodes.BAD_GATEWAY,
    );
  }

  const assistantId = result.assistant_id;

  // 4. Create new agent configuration in DB
  const agent = await prisma.agents.create({
    data: {
      restaurant_id: restaurantId,
      agent_name: assistant_name,
      vapi_assistant_id: assistantId,
      twilio_number: "TBD",
      manager_number: "TBD",
      prompt: welcome_message || "",
      status: "active",
    },
  });

  return {
    agentId: agent.id,
    vapiAssistantId: agent.vapi_assistant_id,
    agentName: agent.agent_name,
    prompt: agent.prompt,
  };
};

const deleteAgentInVapiAndDB = async ({ userId, agentId }) => {
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

  // 2. Find the agent record by agentId
  const agent = await prisma.agents.findUnique({
    where: { id: agentId },
  });

  if (!agent) {
    throw new DevBuildError(
      "Assistant not found",
      StatusCodes.NOT_FOUND,
    );
  }

  // Security check: ensure this agent belongs to the user's restaurant
  if (agent.restaurant_id !== restaurantId) {
    throw new DevBuildError(
      "You are not authorized to delete this assistant",
      StatusCodes.FORBIDDEN,
    );
  }

  const vapiAssistantId = agent.vapi_assistant_id;

  // 3. Request the direct VAPI API to delete the assistant
  if (vapiAssistantId) {
    try {
      const response = await fetch(
        `https://api.vapi.ai/assistant/${vapiAssistantId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${envVars.VAPI_API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      // 404 is fine as it means it was already deleted on VAPI
      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        console.error(`Failed to delete assistant ${vapiAssistantId} from VAPI: ${errorText}`);
        throw new DevBuildError(
          `Failed to delete assistant from VAPI: ${errorText}`,
          response.status || StatusCodes.BAD_GATEWAY,
        );
      }
    } catch (fetchError) {
      if (fetchError instanceof DevBuildError) {
        throw fetchError;
      }
      throw new DevBuildError(
        `Failed to contact VAPI service: ${fetchError.message}`,
        StatusCodes.BAD_GATEWAY,
      );
    }
  }

  // 4. Delete or disable the agent record from the database based on call history
  const callCount = await prisma.calls.count({
    where: { agent_id: agent.id },
  });

  if (callCount === 0) {
    await prisma.agents.delete({
      where: { id: agent.id },
    });
  } else {
    await prisma.agents.update({
      where: { id: agent.id },
      data: {
        vapi_assistant_id: "",
        status: "inactive",
      },
    });
  }

  return {
    success: true,
    message: "Agent deleted successfully from Vapi and DB",
  };
};

const getAgentsByRestaurant = async ({ userId }) => {
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

  // 2. Fetch all agents belonging to this restaurant
  const agents = await prisma.agents.findMany({
    where: { restaurant_id: restaurantId },
  });

  return agents.map((agent) => ({
    id: agent.id,
    restaurantId: agent.restaurant_id,
    agentName: agent.agent_name,
    twilioNumber: agent.twilio_number,
    vapiAssistantId: agent.vapi_assistant_id,
    managerNumber: agent.manager_number,
    prompt: agent.prompt,
    status: agent.status,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at,
  }));
};

export const AiTrainingService = {
  createAgentInVapiAndDB,
  deleteAgentInVapiAndDB,
  getAgentsByRestaurant,
};
