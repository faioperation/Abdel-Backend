import { StatusCodes } from "http-status-codes";
import { StripeService } from "./stripe.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error) => {
  console.error("Business Owner Stripe Error:", error);
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

const updateStripeKeys = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stripeSecretKey, stripePublishableKey } = req.body;

    const result = await StripeService.updateStripeKeysInDB(
      userId,
      stripeSecretKey,
      stripePublishableKey,
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Stripe configuration updated successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const getStripeKeys = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await StripeService.getStripeKeysFromDB(userId);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Stripe configuration fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteStripeKeys = async (req, res) => {
  try {
    const userId = req.user.id;
    const { restaurantId } = req.params;

    const result = await StripeService.deleteStripeKeysFromDB(userId, restaurantId);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Stripe configuration deleted successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const StripeController = {
  updateStripeKeys,
  getStripeKeys,
  deleteStripeKeys,
};
