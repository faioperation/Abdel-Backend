import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const getRestaurantForUser = async (userId) => {
  const userRestaurant = await prisma.user_restaurant.findFirst({
    where: { user_id: userId },
  });
  if (!userRestaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND,
    );
  }
  return userRestaurant.restaurant_id;
};

const getPrinters = async (userId) => {
  const restaurantId = await getRestaurantForUser(userId);

  const printers = await prisma.printers.findMany({
    where: { restaurant_id: restaurantId },
    orderBy: { created_at: "desc" },
  });

  const now = new Date();
  const thresholdMs = 60 * 1000; // 60 seconds

  const updatedPrinters = await Promise.all(
    printers.map(async (printer) => {
      if (
        printer.status === "online" &&
        now - new Date(printer.last_seen) > thresholdMs
      ) {
        return await prisma.printers.update({
          where: { id: printer.id },
          data: { status: "offline" },
        });
      }
      return printer;
    }),
  );

  return updatedPrinters;
};

const createPrinter = async (userId, data) => {
  const restaurantId = await getRestaurantForUser(userId);
  const { device_name, serial_number } = data;

  if (!device_name || !serial_number) {
    throw new DevBuildError(
      "Device name and serial number/MAC address are required",
      StatusCodes.BAD_REQUEST,
    );
  }

  // Normalize serial number
  const normalizedSerial = serial_number.trim();

  // Check if serial number already registered for this restaurant
  const existing = await prisma.printers.findFirst({
    where: {
      restaurant_id: restaurantId,
      serial_number: normalizedSerial,
    },
  });

  if (existing) {
    throw new DevBuildError(
      "A printer with this serial number/MAC address is already registered",
      StatusCodes.BAD_REQUEST,
    );
  }

  return await prisma.printers.create({
    data: {
      restaurant_id: restaurantId,
      device_name: device_name.trim(),
      serial_number: normalizedSerial,
      status: "offline",
    },
  });
};

const updatePrinter = async (userId, printerId, data) => {
  const restaurantId = await getRestaurantForUser(userId);
  const { device_name, serial_number } = data;

  const printer = await prisma.printers.findUnique({
    where: { id: printerId },
  });

  if (!printer || printer.restaurant_id !== restaurantId) {
    throw new DevBuildError("Printer not found", StatusCodes.NOT_FOUND);
  }

  const updateData = {};
  if (device_name) updateData.device_name = device_name.trim();

  if (serial_number) {
    const normalizedSerial = serial_number.trim();
    if (normalizedSerial !== printer.serial_number) {
      // Check duplicate
      const existing = await prisma.printers.findFirst({
        where: {
          restaurant_id: restaurantId,
          serial_number: normalizedSerial,
          id: { not: printerId },
        },
      });

      if (existing) {
        throw new DevBuildError(
          "Another printer with this serial number/MAC address is already registered",
          StatusCodes.BAD_REQUEST,
        );
      }
      updateData.serial_number = normalizedSerial;
    }
  }

  return await prisma.printers.update({
    where: { id: printerId },
    data: updateData,
  });
};

const deletePrinter = async (userId, printerId) => {
  const restaurantId = await getRestaurantForUser(userId);

  const printer = await prisma.printers.findUnique({
    where: { id: printerId },
  });

  if (!printer || printer.restaurant_id !== restaurantId) {
    throw new DevBuildError("Printer not found", StatusCodes.NOT_FOUND);
  }

  await prisma.printers.delete({
    where: { id: printerId },
  });

  return { id: printerId };
};

const getPrinterById = async (userId, printerId) => {
  const restaurantId = await getRestaurantForUser(userId);

  const printer = await prisma.printers.findUnique({
    where: { id: printerId },
  });

  if (!printer || printer.restaurant_id !== restaurantId) {
    throw new DevBuildError("Printer not found", StatusCodes.NOT_FOUND);
  }

  const now = new Date();
  const thresholdMs = 60 * 1000; // 60 seconds

  if (
    printer.status === "online" &&
    now - new Date(printer.last_seen) > thresholdMs
  ) {
    return await prisma.printers.update({
      where: { id: printer.id },
      data: { status: "offline" },
    });
  }

  return printer;
};

const queueOrderPrint = async (userId, printerId, orderId) => {
  const restaurantId = await getRestaurantForUser(userId);

  // Validate printer
  const printer = await prisma.printers.findUnique({
    where: { id: printerId },
  });

  if (!printer || printer.restaurant_id !== restaurantId) {
    throw new DevBuildError("Printer not found", StatusCodes.NOT_FOUND);
  }

  // Validate order
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
  });

  if (!order || order.restaurant_id !== restaurantId) {
    throw new DevBuildError("Order not found", StatusCodes.NOT_FOUND);
  }

  // Create a pending print job
  const job = await prisma.print_jobs.create({
    data: {
      printer_id: printerId,
      order_id: orderId,
      status: "pending",
      retry_count: 0,
    },
  });

  return job;
};

export const PrinterService = {
  getPrinters,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  queueOrderPrint,
};
