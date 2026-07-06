import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const parseItemsFromNotes = (notes) => {
  if (!notes) return [];

  const trimmed = notes.trim();

  // Try JSON first
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      const itemsArray = Array.isArray(parsed) ? parsed : [parsed];
      return itemsArray.map((item) => {
        const qty = Number(item.quantity || item.qty || 1);
        const name =
          item.name ||
          item.itemName ||
          item.item_name ||
          item.product ||
          item.productName ||
          "Unknown Item";
        const size =
          item.size || item.itemSize || item.item_size || item.variant || "N/A";
        return { quantity: qty, name, size };
      });
    } catch (e) {
      // Ignore JSON error and fallback to text parsing
    }
  }

  // Fallback: Text parsing
  // Split by newlines or semicolons
  const lines = trimmed.split(/[\r\n;]+/);
  const items = [];

  for (let line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    // Pattern matching: e.g. "1x Margherita (XL)"
    // Group 1: quantity (optional, default 1) followed by "x" or "X"
    // Group 2: name
    // Group 3: size in parentheses (optional)
    const regex = /^(?:(\d+)\s*[xX]\s+)?([^(]+)(?:\(([^)]+)\))?$/;
    const match = cleanLine.match(regex);

    if (match) {
      const quantity = match[1] ? parseInt(match[1], 10) : 1;
      const name = match[2].trim();
      const size = match[3] ? match[3].trim() : "N/A";
      items.push({ quantity, name, size });
    } else {
      items.push({ quantity: 1, name: cleanLine, size: "N/A" });
    }
  }

  return items;
};

const getOrdersFromDB = async ({ userId }) => {
  // 1. Find the restaurant associated with the logged-in user
  const userRestaurant = await prisma.user_restaurant.findFirst({
    where: { user_id: userId },
  });

  if (!userRestaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND,
    );
  }

  const restaurantId = userRestaurant.restaurant_id;

  // 2. Fetch orders from the database
  const dbOrders = await prisma.orders.findMany({
    where: {
      restaurant_id: restaurantId,
    },
    include: {
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
      call: {
        select: {
          type: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  // 3. Format results to match the UI requirements
  const formattedOrders = dbOrders.map((order) => {
    // Format order number (e.g. #10)
    const orderNumber = order.order_number
      ? `#${order.order_number}`
      : `#${order.id.slice(0, 8)}`;

    // Customer details
    const customerName = order.customer?.name || "Unknown";
    const customerPhone = order.customer?.phone || "N/A";

    // Parse items list from notes
    const items = parseItemsFromNotes(order.notes);

    // Format total price (exactly 2 decimal places, e.g., kr. 129.00)
    const totalVal = typeof order.total === "number" ? order.total : 0;
    const total = `kr. ${totalVal.toFixed(2)}`;

    // Order source
    const source = "CALL";

    // Date formatted (e.g., 6/9/2026, 6:25:30 AM)
    const date = order.created_at
      ? new Date(order.created_at).toLocaleString("en-US", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: true,
        })
      : "Unknown";

    return {
      id: order.id,
      orderNumber,
      customerName,
      customerPhone,
      items,
      total,
      source,
      date,
      orderStatus: order.order_status,
      paymentStatus: order.payment_status,
      orderType: order.order_type || "pickup",
      deliveryAddress: order.delivery_address,
    };
  });

  return formattedOrders;
};

const deleteOrderFromDB = async ({ userId, orderId }) => {
  // 1. Find the restaurant associated with the user
  const userRestaurant = await prisma.user_restaurant.findFirst({
    where: { user_id: userId },
  });

  if (!userRestaurant) {
    throw new DevBuildError(
      "Restaurant not found for this user",
      StatusCodes.NOT_FOUND,
    );
  }

  const restaurantId = userRestaurant.restaurant_id;

  // 2. Find the order and verify restaurant ownership
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new DevBuildError("Order not found", StatusCodes.NOT_FOUND);
  }

  if (order.restaurant_id !== restaurantId) {
    throw new DevBuildError(
      "Unauthorized to delete this order",
      StatusCodes.UNAUTHORIZED,
    );
  }

  // 3. Manually delete related sms_logs to avoid foreign key constraints
  await prisma.sms_logs.deleteMany({
    where: { order_id: orderId },
  });

  // 4. Delete the order (related payments/order_items/print_jobs cascade delete)
  await prisma.orders.delete({
    where: { id: orderId },
  });

  return { id: orderId };
};

export const OrderManagmentService = {
  getOrdersFromDB,
  deleteOrderFromDB,
};
