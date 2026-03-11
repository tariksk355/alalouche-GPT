-- Add optional customer linkage on orders for stronger authenticated identity history lookups.
ALTER TABLE "Order"
ADD COLUMN "customerId" TEXT;

CREATE INDEX "Order_restaurantId_customerId_createdAt_idx"
ON "Order"("restaurantId", "customerId", "createdAt");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
