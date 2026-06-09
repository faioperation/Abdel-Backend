import { StatusCodes } from "http-status-codes";
import { CallHistoryService } from "./call_history.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("Call History Error:", error);
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

const getCallHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { agentId } = req.query;

    const result = await CallHistoryService.getCallHistoryFromVapi({ userId, agentId });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Call history fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const CallHistoryController = {
  getCallHistory,
};
