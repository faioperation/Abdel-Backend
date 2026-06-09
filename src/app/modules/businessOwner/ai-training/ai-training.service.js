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

  // 4. Check if an agent record already exists for this restaurant
  const existingAgent = await prisma.agents.findUnique({
    where: { restaurant_id: restaurantId },
  });

  let agent;
  if (existingAgent) {
    // Update existing agent configuration
    agent = await prisma.agents.update({
      where: { id: existingAgent.id },
      data: {
        agent_name: assistant_name,
        vapi_assistant_id: assistantId,
        prompt: welcome_message || existingAgent.prompt,
      },
    });
  } else {
    // Create new agent configuration in DB
    agent = await prisma.agents.create({
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
  }

  return {
    agentId: agent.id,
    vapiAssistantId: agent.vapi_assistant_id,
    agentName: agent.agent_name,
    prompt: agent.prompt,
  };
};

export const AiTrainingService = {
  createAgentInVapiAndDB,
};
