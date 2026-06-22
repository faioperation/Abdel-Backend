import { StatusCodes } from "http-status-codes";
import { DashboardService } from "./dashboard.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("Dashboard Error:", error);
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

const getTenantUsage = async (req, res) => {
  try {
    const result = await DashboardService.getTenantUsageFromDB();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Tenant call usages fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const DashboardController = {
  getTenantUsage,
};
