import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import prisma from "../../../prisma/client.js";
import DevBuildError from "../../../lib/DevBuildError.js";
import { Role } from "../../../utils/role.js";


const getAllTenantsFromDB = async () => {
  const tenants = await prisma.restaurants.findMany({
    include: {
      subscriptions: {
        orderBy: {
          end_date: "desc",
        },
        take: 1,
        include: {
          plan: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  // Format the response for the UI
  const formattedTenants = tenants.map((tenant) => {
    const latestSubscription = tenant.subscriptions[0] || null;
    return {
      id: tenant.id,
      name: tenant.name,
      plan: latestSubscription ? latestSubscription.plan.name : "No Plan",
      status: tenant.status,
      expiry_date: latestSubscription ? latestSubscription.end_date : null,
      created_at: tenant.created_at,
    };
  });

  return formattedTenants;
};

const getTenantByIdFromDB = async (id) => {
  const tenant = await prisma.restaurants.findUnique({
    where: {
      id,
    },
    include: {
      owner: {
        select: {
          email: true,
          first_name: true,
          last_name: true,
          phone: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new DevBuildError("Tenant not found", StatusCodes.NOT_FOUND);
  }

  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.owner?.email,
    phone: tenant.owner?.phone,
    joined_date: tenant.created_at,
    status: tenant.status,
    billing_history: [],
  };
};

const createTenantInDB = async (payload) => {
  const {
    first_name,
    last_name,
    email,
    password,
    business_name,
    phone,
  } = payload;

  // 1. Check if user already exists
  const existingUser = await prisma.users.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new DevBuildError(
      "User with this email already exists",
      StatusCodes.CONFLICT,
    );
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Sequential transactional creation
  return await prisma.$transaction(async (tx) => {
    // Create the Restaurant Owner
    const owner = await tx.users.create({
      data: {
        first_name,
        last_name,
        email,
        password: hashedPassword,
        role: "RESTAURANT_OWNER",
        is_verified: true, // System owner created accounts are verified by default
        phone: phone,
        status: "active",
      },
    });

    // Create the Restaurant
    const restaurant = await tx.restaurants.create({
      data: {
        name: business_name,
        owner_id: owner.id,
        status: "active",
      },
    });

    // Create user_restaurant link
    await tx.user_restaurant.create({
      data: {
        user_id: owner.id,
        restaurant_id: restaurant.id,
        role: "RESTAURANT_OWNER",
      },
    });

    return { restaurant, owner };
  });
};

const updateTenantInDB = async (id, payload) => {
  return await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurants.update({
      where: {
        id,
      },
      data: payload,
    });

    if (payload.status) {
      const userStatus = payload.status === "active" ? "active" : "inactive";
      await tx.users.update({
        where: { id: restaurant.owner_id },
        data: { status: userStatus },
      });
    }

    return restaurant;
  });
};

const deleteTenantFromDB = async (id) => {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id },
    select: { owner_id: true },
  });

  if (!restaurant) {
    throw new DevBuildError("Tenant not found", StatusCodes.NOT_FOUND);
  }

  const ownerId = restaurant.owner_id;

  return await prisma.$transaction(async (tx) => {
    // Delete the restaurant (which cascades to all its related tables)
    await tx.restaurants.delete({
      where: { id },
    });

    // Finally delete the owner user
    return await tx.users.delete({
      where: { id: ownerId },
    });
  });
};

export const TenantsService = {
  getAllTenantsFromDB,
  createTenantInDB,
  getTenantByIdFromDB,
  updateTenantInDB,
  deleteTenantFromDB,
};
