const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

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

  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {
      displayName: 'Admin Local',
      restaurantId: restaurant.id,
      passwordHash: hashPassword('admin1234'),
    },
    create: {
      username: 'admin',
      displayName: 'Admin Local',
      restaurantId: restaurant.id,
      passwordHash: hashPassword('admin1234'),
    },
  });

  await prisma.customer.upsert({
    where: { restaurantId_email: { restaurantId: restaurant.id, email: 'demo.customer@alalouche.local' } },
    update: {
      fullName: 'Client Démo',
      passwordHash: hashPassword('customer1234'),
      phone: '0263034561',
    },
    create: {
      restaurantId: restaurant.id,
      fullName: 'Client Démo',
      email: 'demo.customer@alalouche.local',
      passwordHash: hashPassword('customer1234'),
      phone: '0263034561',
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
  console.log('[seed] admin user: admin / admin1234');
  console.log('[seed] demo customer: demo.customer@alalouche.local / customer1234');
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });