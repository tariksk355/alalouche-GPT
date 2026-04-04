CREATE TABLE "StorefrontVisit" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StorefrontVisit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StorefrontVisit"
  ADD CONSTRAINT "StorefrontVisit_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "StorefrontVisit_restaurantId_createdAt_idx" ON "StorefrontVisit"("restaurantId", "createdAt");
