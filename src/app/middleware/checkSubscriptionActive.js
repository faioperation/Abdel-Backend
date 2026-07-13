import prisma from "../prisma/client.js";
import { Role } from "../utils/role.js";

export const checkSubscriptionActive = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Only enforce subscription restrictions on Restaurant Owners
    if (user.role !== Role.RESTAURANT_OWNER) {
      return next();
    }

    const userRestaurant = await prisma.user_restaurant.findFirst({
      where: { user_id: user.id },
    });

    if (!userRestaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }

    const restaurantId = userRestaurant.restaurant_id;

    // Check restaurant status
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    if (restaurant.status !== "active") {
      return res.status(402).json({
        success: false,
        message: "Your restaurant service is suspended or expired. Please renew your subscription.",
      });
    }

    // Check active subscription
    const activeSub = await prisma.subscriptions.findFirst({
      where: {
        restaurant_id: restaurantId,
        status: "active",
      },
    });

    if (!activeSub) {
      // In case restaurant status is active in DB but no active subscription exists, sync it to expired
      await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { status: "expired" },
      });

      return res.status(402).json({
        success: false,
        message: "No active subscription found. Please select a plan.",
      });
    }

    // Make restaurantId and activeSubscription available on request object
    req.restaurantId = restaurantId;
    req.activeSubscription = activeSub;

    next();
  } catch (error) {
    console.error("checkSubscriptionActive Middleware Error:", error);
    return res.status(500).json({
      success: false,
      message: "An internal server error occurred during subscription check",
    });
  }
};
