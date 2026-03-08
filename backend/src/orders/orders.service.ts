import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOpenOrders(restaurantId: string) {
    return this.prisma.order.findMany({
      where: { restaurantId, status: { in: ['new', 'accepted', 'ready'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateStatus(restaurantId: string, orderId: string, status: 'accepted' | 'ready' | 'completed') {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found for this restaurant.' });
    }

    return this.prisma.order.update({ where: { id: orderId }, data: { status } });
  }
}
