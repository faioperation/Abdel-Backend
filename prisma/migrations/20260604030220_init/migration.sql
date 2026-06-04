/*
  Warnings:

  - The values [BUSINESS_OWNER] on the enum `user_role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `gender` on the `users` table. All the data in the column will be lost.
  - Added the required column `status` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `users` table without a default value. This is not possible if the table is not empty.
  - Made the column `avatar` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `country` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "restaurant_status" AS ENUM ('active', 'suspended', 'expired');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'paid', 'preparing', 'completed', 'canceled');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "call_status" AS ENUM ('ongoing', 'completed', 'failed', 'transferred');

-- CreateEnum
CREATE TYPE "call_type" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "printer_status" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('active', 'inactive');

-- AlterEnum
BEGIN;
CREATE TYPE "user_role_new" AS ENUM ('SYSTEM_OWNER', 'RESTAURANT_OWNER');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_new" USING ("role"::text::"user_role_new");
ALTER TYPE "user_role" RENAME TO "user_role_old";
ALTER TYPE "user_role_new" RENAME TO "user_role";
DROP TYPE "public"."user_role_old";
COMMIT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "gender",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "user_status" NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "avatar" SET NOT NULL,
ALTER COLUMN "country" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "role" DROP DEFAULT,
ALTER COLUMN "is_verified" DROP DEFAULT;

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "restaurant_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_restaurant" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_price" DOUBLE PRECISION NOT NULL,
    "yearly_price" DOUBLE PRECISION NOT NULL,
    "stripe_monthly_price_id" TEXT NOT NULL,
    "stripe_yearly_price_id" TEXT NOT NULL,
    "call_limit" INTEGER NOT NULL,
    "order_limit" INTEGER NOT NULL,
    "features" TEXT[],

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "subscription_status" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_usage" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "total_calls" INTEGER NOT NULL,
    "total_orders" INTEGER NOT NULL,
    "current_month" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "twilio_number" TEXT NOT NULL,
    "vapi_assistant_id" TEXT NOT NULL,
    "manager_number" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "agent_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "total_orders" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "type" "call_type" NOT NULL,
    "status" "call_status" NOT NULL,
    "recording_url" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "order_status" "order_status" NOT NULL,
    "payment_status" "payment_status" NOT NULL,
    "notes" TEXT NOT NULL,
    "pickup_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "stripe_payment_intent" TEXT NOT NULL,
    "payment_link" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "payment_status" NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_cache" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "hit_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "status" "printer_status" NOT NULL,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "printer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_integrations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "external_store_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "total_calls" INTEGER NOT NULL,
    "total_orders" INTEGER NOT NULL,
    "total_duration" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_settings" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "business_hours" JSONB NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_restaurant_id_key" ON "agents"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "audio_cache_hash_key" ON "audio_cache"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_settings_restaurant_id_key" ON "restaurant_settings"("restaurant_id");
