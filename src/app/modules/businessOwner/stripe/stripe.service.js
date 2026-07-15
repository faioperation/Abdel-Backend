import { StatusCodes } from "http-status-codes";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";

const obfuscateKey = (key) => {
  if (!key) return null;
  if (key.length <= 8) return "****";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
};

const updateStripeKeysInDB = async (
  userId,
  stripeSecretKey,
  stripePublishableKey,
) => {
  // 1. Find the restaurant associated with this business owner
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

  // 2. Check if keys are already configured
  const existingRestaurant = await prisma.restaurants.findUnique({
    where: { id: restaurantId },
    select: {
      stripe_secret_key: true,
      stripe_publishable_key: true,
    },
  });

  if (
    existingRestaurant &&
    (existingRestaurant.stripe_secret_key ||
      existingRestaurant.stripe_publishable_key)
  ) {
    throw new DevBuildError(
      "Stripe keys are already configured. Please delete the existing configuration first before adding new keys.",
      StatusCodes.BAD_REQUEST,
    );
  }

  // 3. Update the restaurant stripe credentials
  const updatedRestaurant = await prisma.restaurants.update({
    where: { id: restaurantId },
    data: {
      stripe_secret_key: stripeSecretKey,
      stripe_publishable_key: stripePublishableKey,
    },
  });

  return {
    restaurantId,
    stripePublishableKey: updatedRestaurant.stripe_publishable_key,
    stripeSecretKey: obfuscateKey(updatedRestaurant.stripe_secret_key),
  };
};

const getStripeKeysFromDB = async (userId) => {
  // 1. Find the restaurant associated with this business owner
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

  // 2. Retrieve key configuration
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: restaurantId },
    select: {
      stripe_secret_key: true,
      stripe_publishable_key: true,
    },
  });

  if (!restaurant) {
    throw new DevBuildError("Restaurant not found", StatusCodes.NOT_FOUND);
  }

  return {
    restaurantId,
    stripePublishableKey: restaurant.stripe_publishable_key || null,
    stripeSecretKey: obfuscateKey(restaurant.stripe_secret_key),
    isConnected: !!(
      restaurant.stripe_secret_key && restaurant.stripe_publishable_key
    ),
  };
};

const deleteStripeKeysFromDB = async (userId, restaurantId) => {
  // 1. Verify restaurant belongs to the user
  const userRestaurant = await prisma.user_restaurant.findFirst({
    where: { user_id: userId, restaurant_id: restaurantId },
  });

  if (!userRestaurant) {
    throw new DevBuildError(
      "Restaurant not found or unauthorized",
      StatusCodes.UNAUTHORIZED,
    );
  }

  // 2. Set keys to null
  await prisma.restaurants.update({
    where: { id: restaurantId },
    data: {
      stripe_secret_key: null,
      stripe_publishable_key: null,
    },
  });

  return { success: true };
};

export const StripeService = {
  updateStripeKeysInDB,
  getStripeKeysFromDB,
  deleteStripeKeysFromDB,
};
