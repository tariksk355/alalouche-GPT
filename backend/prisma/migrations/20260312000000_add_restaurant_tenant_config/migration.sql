-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('active', 'inactive', 'onboarding');

-- AlterTable
ALTER TABLE "Restaurant"
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "primaryDomain" TEXT,
ADD COLUMN     "status" "RestaurantStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "branding" JSONB,
ADD COLUMN     "contactInfo" JSONB,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr-CH',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Zurich',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CHF',
ADD COLUMN     "capabilities" JSONB,
ADD COLUMN     "orderingSettings" JSONB,
ADD COLUMN     "reservationSettings" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_primaryDomain_key" ON "Restaurant"("primaryDomain");
