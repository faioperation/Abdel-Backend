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

const getBillingHistory = async (req, res) => {
  try {
    const result = await SubscriptionPlanService.getBillingHistory(
      prisma,
      req.user,
      req.query,
    );
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Billing history retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const getMySubscription = async (req, res) => {
  try {
    const result = await SubscriptionPlanService.getMySubscription(
      prisma,
      req.user
    );
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Subscription details retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const SubscriptionPlanController = {
  getAllPlans,
  getBillingHistory,
  getMySubscription,
};
