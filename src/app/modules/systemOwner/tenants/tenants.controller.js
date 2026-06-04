import { StatusCodes } from "http-status-codes";
import { TenantsService } from "./tenants.service.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import prisma from "../../../prisma/client.js";

const handleError = (res, error) => {
  console.error("Tenants Error:", error);
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

const getAllTenants = async (req, res) => {
  try {
    const result = await TenantsService.getAllTenantsFromDB();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Tenants fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const createTenant = async (req, res) => {
  try {
    const result = await TenantsService.createTenantInDB(req.body);

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Tenant created successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const getTenantById = async (req, res) => {
  try {
    const result = await TenantsService.getTenantByIdFromDB(req.params.id);
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Tenant fetched successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;

    const result = await TenantsService.updateTenantInDB(tenantId, req.body);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Tenant updated successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteTenant = async (req, res) => {
  try {
    const tenantId = req.params.id;

    const result = await TenantsService.deleteTenantFromDB(tenantId);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Tenant deleted successfully",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const TenantsController = {
  getAllTenants,
  createTenant,
  getTenantById,
  updateTenant,
  deleteTenant,
};
