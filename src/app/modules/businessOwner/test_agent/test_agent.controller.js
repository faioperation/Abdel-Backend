import { StatusCodes } from "http-status-codes";
import { TestAgentService } from "./test_agent.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("Test Agent Error:", error);
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

const getCallableAgents = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await TestAgentService.getCallableAgents({ userId });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Callable agents fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const startCall = async (req, res) => {
  try {
    const userId = req.user.id;
    const { agentId } = req.body;

    const result = await TestAgentService.getCallConfig({ userId, agentId });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Call configuration ready",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const TestAgentController = {
  getCallableAgents,
  startCall,
};
