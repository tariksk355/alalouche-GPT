ALTER TABLE "Order" ADD COLUMN "adminHiddenAt" TIMESTAMP(3);
ALTER TABLE "Reservation" ADD COLUMN "adminHiddenAt" TIMESTAMP(3);

CREATE INDEX "Order_restaurantId_adminHiddenAt_createdAt_idx" ON "Order"("restaurantId", "adminHiddenAt", "createdAt");
CREATE INDEX "Reservation_restaurantId_adminHiddenAt_reservationDate_idx" ON "Reservation"("restaurantId", "adminHiddenAt", "reservationDate");
