import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}


  async listAdminOrders(restaurantId: string) {
    return this.prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listAdminReservations(restaurantId: string) {
    return this.prisma.reservation.findMany({
      where: { restaurantId },
      orderBy: [{ reservationDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async listOpenOrders(restaurantId: string) {
    return this.prisma.order.findMany({
      where: { restaurantId, status: { in: ['new', 'accepted', 'ready'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listOpenReservations(restaurantId: string) {
    return this.prisma.reservation.findMany({
      where: { restaurantId, status: { in: ['pending', 'confirmed'] } },
      orderBy: { reservationDate: 'asc' },
      take: 100,
    });
  }

  async updateStatus(
    restaurantId: string,
    orderId: string,
    status: 'accepted' | 'ready' | 'completed',
    prepMinutes?: 15 | 30 | 45 | 60,
  ) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found for this restaurant.' });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        prepMinutes: status === 'accepted' ? prepMinutes ?? order.prepMinutes : order.prepMinutes,
        payload: {
          ...(typeof order.payload === 'object' && order.payload ? (order.payload as Record<string, unknown>) : {}),
          customerFacingStatus: status,
          prepMinutes: status === 'accepted' ? prepMinutes ?? order.prepMinutes : order.prepMinutes,
          statusUpdatedAt: new Date().toISOString(),
        },
      },
    });

    await this.notificationService.publish({
      type: 'order.status_changed',
      restaurantId,
      customerEmail: order.customerEmail,
      payload: {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        prepMinutes: updated.prepMinutes,
      },
    });

    return updated;
  }

  async updateReservationStatus(
    restaurantId: string,
    reservationId: string,
    status: 'confirmed' | 'cancelled',
  ) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
    if (!reservation) {
      throw new NotFoundException({ error: 'RESERVATION_NOT_FOUND', message: 'Reservation not found for this restaurant.' });
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status, statusUpdatedAt: new Date() },
    });

    await this.notificationService.publish({
      type: 'reservation.status_changed',
      restaurantId,
      customerEmail: reservation.customerEmail,
      payload: {
        reservationId: updated.id,
        customerName: updated.customerName,
        status: updated.status,
        reservationDate: updated.reservationDate.toISOString(),
      },
    });

    return updated;
  }

  async getDailyKpis(restaurantId: string) {

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [orders, reservations, turnoverAgg] = await Promise.all([
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
          status: { in: ['accepted', 'ready', 'completed'] },
        },
      }),
    ]);

    return {
      date: start.toISOString().slice(0, 10),
      dailyTurnover: Number(turnoverAgg._sum.totalAmount || 0),
      orderCount: orders,
      reservationCount: reservations,
      visitorCount: null,
      visitorCountNote: 'Placeholder: visitor tracking not wired yet.',
    };
  }
}