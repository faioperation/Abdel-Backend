import { StatusCodes } from "http-status-codes";
import { SubscriptionPlanService } from "./subscriptionPlan.service.js";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("SubscriptionPlan Error:", error);
  if (error instanceof DevBuildError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }
  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "An internal server error occurred",
  });
};

const getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlanService.getAllPlans(prisma, req.user);
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Plans retrieved successfully",
      data: plans,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const SubscriptionPlanController = {
  getAllPlans,
};
