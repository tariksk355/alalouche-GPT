-- CreateEnum
CREATE TYPE "DeviceLifecycleStatus" AS ENUM ('code_created', 'request_pending', 'request_confirmed', 'device_active', 'device_revoked', 'device_expired');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('new', 'accepted', 'ready', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairingCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "DeviceLifecycleStatus" NOT NULL DEFAULT 'code_created',
    "restaurantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairingRequest" (
    "id" TEXT NOT NULL,
    "pairingCodeId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "DeviceLifecycleStatus" NOT NULL DEFAULT 'request_pending',
    "deviceName" TEXT,
    "deviceModel" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "installId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "tokenIssuedAt" TIMESTAMP(3),
    "plainTokenPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePairingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "pairingRequestId" TEXT,
    "status" "DeviceLifecycleStatus" NOT NULL DEFAULT 'device_active',
    "deviceName" TEXT NOT NULL,
    "deviceModel" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "installId" TEXT,
    "tokenHash" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'new',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairingCode_code_key" ON "DevicePairingCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairingRequestId_key" ON "Device"("pairingRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- AddForeignKey
ALTER TABLE "DevicePairingCode" ADD CONSTRAINT "DevicePairingCode_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairingRequest" ADD CONSTRAINT "DevicePairingRequest_pairingCodeId_fkey" FOREIGN KEY ("pairingCodeId") REFERENCES "DevicePairingCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePairingRequest" ADD CONSTRAINT "DevicePairingRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_pairingRequestId_fkey" FOREIGN KEY ("pairingRequestId") REFERENCES "DevicePairingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
