#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const options = {
    apply: false,
    restaurantId: null,
    limit: 1000,
  };

  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg.startsWith('--restaurant-id=')) options.restaurantId = arg.split('=')[1] || null;
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.split('=')[1] || 1000);
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error('Invalid --limit value.');
  }

  return options;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const where = {
    customerId: null,
    customerEmail: { not: null },
    ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    select: { id: true, restaurantId: true, customerEmail: true, orderNumber: true },
    orderBy: { createdAt: 'asc' },
    take: opts.limit,
  });

  const stats = {
    scanned: orders.length,
    matched: 0,
    updated: 0,
    skippedNoCustomer: 0,
    skippedAmbiguous: 0,
  };

  for (const order of orders) {
    const email = (order.customerEmail || '').trim().toLowerCase();
    if (!email) {
      stats.skippedNoCustomer += 1;
      continue;
    }

    const candidates = await prisma.customer.findMany({
      where: {
        restaurantId: order.restaurantId,
        email,
      },
      select: { id: true },
      take: 2,
    });

    if (candidates.length === 0) {
      stats.skippedNoCustomer += 1;
      continue;
    }

    if (candidates.length > 1) {
      // Defensive: should not happen due unique(restaurantId, email), but never guess.
      stats.skippedAmbiguous += 1;
      continue;
    }

    stats.matched += 1;

    if (opts.apply) {
      await prisma.order.update({
        where: { id: order.id },
        data: { customerId: candidates[0].id },
      });
      stats.updated += 1;
    }
  }

  const mode = opts.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`[backfill-order-customer-id] mode=${mode}`);
  console.log(`[backfill-order-customer-id] scanned=${stats.scanned} matched=${stats.matched} updated=${stats.updated} skippedNoCustomer=${stats.skippedNoCustomer} skippedAmbiguous=${stats.skippedAmbiguous}`);
  if (!opts.apply) {
    console.log('[backfill-order-customer-id] Re-run with --apply to persist updates.');
  }
}

main()
  .catch((error) => {
    console.error('[backfill-order-customer-id] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
