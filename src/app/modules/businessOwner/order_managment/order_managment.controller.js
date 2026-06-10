import { StatusCodes } from "http-status-codes";
import { OrderManagmentService } from "./order_managment.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const handleError = (res, error, context = "Order Management") => {
  console.error(`${context} Error:`, error);
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

const getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await OrderManagmentService.getOrdersFromDB({ userId });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Customer orders fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error, "Get Orders");
  }
};

const deleteOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.id;

    if (!orderId) {
      throw new DevBuildError("Order ID is required", StatusCodes.BAD_REQUEST);
    }

    const result = await OrderManagmentService.deleteOrderFromDB({
      userId,
      orderId,
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Order deleted successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error, "Delete Order");
  }
};

export const OrderManagmentController = {
  getOrders,
  deleteOrder,
};
