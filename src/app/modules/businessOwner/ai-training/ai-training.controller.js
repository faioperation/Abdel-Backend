import { StatusCodes } from "http-status-codes";
import { AiTrainingService } from "./ai-training.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("AI Training Error:", error);
  if (error instanceof DevBuildError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }
  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: error.message || "An internal server error occurred",
  });
};

const createAgent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { assistant_name, welcome_message } = req.body;
    const file = req.file;

    const result = await AiTrainingService.createAgentInVapiAndDB({
      userId,
      assistant_name,
      welcome_message,
      file,
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Agent created successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteAgent = async (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = req.params.id;

    const result = await AiTrainingService.deleteAgentInVapiAndDB({
      userId,
      agentId,
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Agent deleted successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const getAgentsByRestaurant = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await AiTrainingService.getAgentsByRestaurant({ userId });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Agents fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const AiTrainingController = {
  createAgent,
  deleteAgent,
  getAgentsByRestaurant,
};
