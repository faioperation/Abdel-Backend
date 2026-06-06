import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seeding...");

  // Hash the password
  const passwordHash = await bcrypt.hash("123456", 12);

  // 1. Create or update System Owner
  const systemOwner = await prisma.users.upsert({
    where: { email: "system@test.com" },
    update: {
      password: passwordHash,
      first_name: "System",
      last_name: "Owner",
      role: "SYSTEM_OWNER",
      status: "active",
      is_verified: true,
    },
    create: {
      email: "system@test.com",
      password: passwordHash,
      first_name: "System",
      last_name: "Owner",
      role: "SYSTEM_OWNER",
      status: "active",
      is_verified: true,
    },
  });
  console.log(`👤 System Owner seeded: ${systemOwner.email}`);

  // 2. Create or update Restaurant Owner
  const restaurantOwner = await prisma.users.upsert({
    where: { email: "restaurent@test.com" },
    update: {
      password: passwordHash,
      first_name: "Restaurant",
      last_name: "Owner",
      role: "RESTAURANT_OWNER",
      status: "active",
      is_verified: true,
    },
    create: {
      email: "restaurent@test.com",
      password: passwordHash,
      first_name: "Restaurant",
      last_name: "Owner",
      role: "RESTAURANT_OWNER",
      status: "active",
      is_verified: true,
    },
  });
  console.log(`👤 Restaurant Owner seeded: ${restaurantOwner.email}`);

  // 3. Create or find the demo restaurant owned by the Restaurant Owner
  let restaurant = await prisma.restaurants.findFirst({
    where: {
      name: "demo restaurent",
      owner_id: restaurantOwner.id,
    },
  });

  if (!restaurant) {
    restaurant = await prisma.restaurants.create({
      data: {
        name: "demo restaurent",
        owner_id: restaurantOwner.id,
        status: "active",
      },
    });
    console.log(`🏪 Restaurant created: ${restaurant.name}`);
  } else {
    console.log(`🏪 Restaurant already exists: ${restaurant.name}`);
  }

  // 4. Ensure the user_restaurant mapping exists for the Restaurant Owner
  const existingMapping = await prisma.user_restaurant.findFirst({
    where: {
      user_id: restaurantOwner.id,
      restaurant_id: restaurant.id,
    },
  });

  if (!existingMapping) {
    await prisma.user_restaurant.create({
      data: {
        user_id: restaurantOwner.id,
        restaurant_id: restaurant.id,
        role: "RESTAURANT_OWNER",
      },
    });
    console.log(`🔗 Linked Restaurant Owner to Restaurant in user_restaurant`);
  } else {
    console.log(`🔗 Link already exists in user_restaurant`);
  }

  console.log("✅ Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
