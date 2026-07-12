-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "stripe_publishable_key" TEXT,
ADD COLUMN     "stripe_secret_key" TEXT;
