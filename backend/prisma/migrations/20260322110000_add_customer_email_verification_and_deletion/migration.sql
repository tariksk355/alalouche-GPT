-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationSentAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationTokenHash" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_restaurantId_deletedAt_createdAt_idx" ON "Customer"("restaurantId", "deletedAt", "createdAt");
