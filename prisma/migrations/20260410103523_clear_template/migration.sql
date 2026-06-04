/*
  Warnings:

  - You are about to drop the column `created_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `credits` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `ai_samples` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `api_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `business` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `business_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `call_messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `call_summaries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `calls` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `faqs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `integrations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `subscriptions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `training_files` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `training_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `usage_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_business` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ai_samples" DROP CONSTRAINT "ai_samples_business_id_fkey";

-- DropForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_business_id_fkey";

-- DropForeignKey
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_usersId_fkey";

-- DropForeignKey
ALTER TABLE "business" DROP CONSTRAINT "business_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "business_settings" DROP CONSTRAINT "business_settings_business_id_fkey";

-- DropForeignKey
ALTER TABLE "call_messages" DROP CONSTRAINT "call_messages_call_id_fkey";

-- DropForeignKey
ALTER TABLE "call_summaries" DROP CONSTRAINT "call_summaries_call_id_fkey";

-- DropForeignKey
ALTER TABLE "calls" DROP CONSTRAINT "calls_business_id_fkey";

-- DropForeignKey
ALTER TABLE "calls" DROP CONSTRAINT "calls_user_id_fkey";

-- DropForeignKey
ALTER TABLE "faqs" DROP CONSTRAINT "faqs_business_id_fkey";

-- DropForeignKey
ALTER TABLE "integrations" DROP CONSTRAINT "integrations_business_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_business_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_business_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "training_files" DROP CONSTRAINT "training_files_session_id_fkey";

-- DropForeignKey
ALTER TABLE "training_sessions" DROP CONSTRAINT "training_sessions_business_id_fkey";

-- DropForeignKey
ALTER TABLE "training_sessions" DROP CONSTRAINT "training_sessions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "usage_logs" DROP CONSTRAINT "usage_logs_business_id_fkey";

-- DropForeignKey
ALTER TABLE "user_business" DROP CONSTRAINT "user_business_business_id_fkey";

-- DropForeignKey
ALTER TABLE "user_business" DROP CONSTRAINT "user_business_user_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "created_at",
DROP COLUMN "credits",
DROP COLUMN "status",
DROP COLUMN "updated_at";

-- DropTable
DROP TABLE "ai_samples";

-- DropTable
DROP TABLE "api_keys";

-- DropTable
DROP TABLE "business";

-- DropTable
DROP TABLE "business_settings";

-- DropTable
DROP TABLE "call_messages";

-- DropTable
DROP TABLE "call_summaries";

-- DropTable
DROP TABLE "calls";

-- DropTable
DROP TABLE "faqs";

-- DropTable
DROP TABLE "integrations";

-- DropTable
DROP TABLE "invoices";

-- DropTable
DROP TABLE "plans";

-- DropTable
DROP TABLE "platform_settings";

-- DropTable
DROP TABLE "subscriptions";

-- DropTable
DROP TABLE "training_files";

-- DropTable
DROP TABLE "training_sessions";

-- DropTable
DROP TABLE "usage_logs";

-- DropTable
DROP TABLE "user_business";

-- DropEnum
DROP TYPE "billing_cycle";

-- DropEnum
DROP TYPE "billing_status";

-- DropEnum
DROP TYPE "call_status";

-- DropEnum
DROP TYPE "call_type";

-- DropEnum
DROP TYPE "plan_type";

-- DropEnum
DROP TYPE "sender_type";

-- DropEnum
DROP TYPE "subscription_status";

-- DropEnum
DROP TYPE "tenant_status";

-- DropEnum
DROP TYPE "training_status";

-- DropEnum
DROP TYPE "training_type";

-- DropEnum
DROP TYPE "user_status";
