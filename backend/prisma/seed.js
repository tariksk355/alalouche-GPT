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
            status: 'new',
            payload: {
              items: [
                { name: 'Sandwich', quantity: 1, price: 12.5 },
                { name: 'Frites', quantity: 1, price: 4.5 }
              ],
              total: 17.0
            }
          },
          {
            restaurantId: restaurant.id,
            orderNumber: 'LOC-1002',
            customerName: 'Test Customer Two',
            status: 'accepted',
            payload: {
              items: [{ name: 'Salade', quantity: 2, price: 8.0 }],
              total: 16.0
            }
          }
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
