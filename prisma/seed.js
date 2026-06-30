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

  // 5. Seed Plans
  const plansData = [
    {
      name: "Basic",
      monthly_price: 10,
      yearly_price: 120,
      stripe_monthly_price_id: "",
      stripe_yearly_price_id: "",
      call_limit: 100,
      order_limit: 50,
      features: ["Basic Call Answering", "Standard Support"],
    },
    {
      name: "Pro",
      monthly_price: 20,
      yearly_price: 240,
      stripe_monthly_price_id: "price_1TJwU81tuanUVwVFV4yICkh2",
      stripe_yearly_price_id: "price_1TJwUZ1tuanUVwVF8nr2nhRx",
      call_limit: 50,
      order_limit: 20,
      features: ["Feature 001 ", "Feature 002"],
    },
    {
      name: "Premium",
      monthly_price: 30,
      yearly_price: 360,
      stripe_monthly_price_id: "",
      stripe_yearly_price_id: "",
      call_limit: 0,
      order_limit: 0,
      features: ["Unlimited Calls", "Unlimited Orders", "Premium Support"],
    },
  ];

  for (const plan of plansData) {
    const existingPlan = await prisma.plans.findFirst({
      where: { name: plan.name },
    });

    if (!existingPlan) {
      await prisma.plans.create({
        data: plan,
      });
      console.log(`🎁 Plan created: ${plan.name}`);
    } else {
      await prisma.plans.update({
        where: { id: existingPlan.id },
        data: plan,
      });
      console.log(`🎁 Plan updated: ${plan.name}`);
    }
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
