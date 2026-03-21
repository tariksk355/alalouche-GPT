-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "promotionId" TEXT,
ADD COLUMN "promotionCode" TEXT,
ADD COLUMN "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill subtotal from existing total values
UPDATE "Order"
SET "subtotalAmount" = "totalAmount"
WHERE "subtotalAmount" = 0;

-- CreateIndex
CREATE INDEX "Order_restaurantId_promotionId_createdAt_idx" ON "Order"("restaurantId", "promotionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
