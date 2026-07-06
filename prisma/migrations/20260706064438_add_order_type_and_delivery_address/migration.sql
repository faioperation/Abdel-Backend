-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_address" TEXT,
ADD COLUMN     "order_type" TEXT DEFAULT 'pickup';
