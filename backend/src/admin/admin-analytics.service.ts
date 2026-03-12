import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(restaurantId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);

    const last7Days: Array<{ date: string; start: Date; end: Date }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      last7Days.push({ date: toDateKey(start), start, end });
    }

    const [allOrders, todayOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { restaurantId },
        select: { createdAt: true, totalAmount: true, payload: true },
      }),
      this.prisma.order.findMany({
        where: { restaurantId, createdAt: { gte: todayStart } },
        select: { createdAt: true, totalAmount: true, payload: true },
      }),
    ]);

    const totals = {
      orders: allOrders.length,
      revenue: allOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
      visits: null as number | null,
    };

    const today = {
      orders: todayOrders.length,
      revenue: todayOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
      visits: null as number | null,
    };

    const orderTypeStats = allOrders.reduce(
      (acc, order) => {
        const payload = (order.payload && typeof order.payload === 'object' ? order.payload : {}) as Record<string, unknown>;
        const orderType = String(payload.orderType || '').toLowerCase();
        if (orderType === 'delivery') {
          acc.delivery += 1;
        } else if (orderType === 'takeaway') {
          acc.takeaway += 1;
        } else {
          acc.other += 1;
        }
        return acc;
      },
      { takeaway: 0, delivery: 0, other: 0 },
    );

    const last7 = last7Days.map((day) => {
      const orders = allOrders.filter((order) => order.createdAt >= day.start && order.createdAt < day.end);
      return {
        date: day.date,
        orders: orders.length,
        revenue: orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
        visits: null as number | null,
      };
    });

    return {
      today,
      totals,
      orderTypeStats,
      last7,
      notes: {
        visits: 'Visitor metrics unavailable: backend visit tracking is not yet implemented.',
      },
    };
  }
}
