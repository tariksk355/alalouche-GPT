-- AlterTable
ALTER TABLE "Customer"
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetSentAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;
