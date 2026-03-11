const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const restaurantId = process.env.DEFAULT_RESTAURANT_ID || 'demo-restaurant';
  const withSampleOrders = process.env.SEED_SAMPLE_ORDERS === 'true';

  const restaurant = await prisma.restaurant.upsert({
    where: { id: restaurantId },
    update: { name: 'À la Louche (Local)' },
    create: {
      id: restaurantId,
      name: 'À la Louche (Local)',
    },
  });

  if (withSampleOrders) {
    const existing = await prisma.order.count({ where: { restaurantId: restaurant.id } });
    if (existing === 0) {
      await prisma.order.createMany({
        data: [
          {
            restaurantId: restaurant.id,
            orderNumber: 'LOC-1001',
            customerName: 'Test Customer One',
            customerEmail: 'customer.one@example.com',
            status: 'new',
            totalAmount: 17.0,
            payload: {
              items: [
                { name: 'Sandwich', quantity: 1, price: 12.5 },
                { name: 'Frites', quantity: 1, price: 4.5 },
              ],
              total: 17.0,
            },
          },
          {
            restaurantId: restaurant.id,
            orderNumber: 'LOC-1002',
            customerName: 'Test Customer Two',
            customerEmail: 'customer.two@example.com',
            status: 'accepted',
            prepMinutes: 30,
            totalAmount: 16.0,
            payload: {
              items: [{ name: 'Salade', quantity: 2, price: 8.0 }],
              total: 16.0,
            },
          },
        ],
      });
    }

    const existingReservations = await prisma.reservation.count({ where: { restaurantId: restaurant.id } });
    if (existingReservations === 0) {
      const now = new Date();
      const upcoming = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const later = new Date(now.getTime() + 5 * 60 * 60 * 1000);

      await prisma.reservation.createMany({
        data: [
          {
            restaurantId: restaurant.id,
            customerName: 'Reservation Demo One',
            customerEmail: 'res.one@example.com',
            guestCount: 2,
            reservationDate: upcoming,
            status: 'pending',
            notes: 'Window seat',
          },
          {
            restaurantId: restaurant.id,
            customerName: 'Reservation Demo Two',
            customerEmail: 'res.two@example.com',
            guestCount: 4,
            reservationDate: later,
            status: 'confirmed',
          },
        ],
      });
    }
  }

  console.log('[seed] restaurant:', restaurant.id);
  console.log('[seed] sample orders:', withSampleOrders ? 'enabled' : 'disabled');
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });