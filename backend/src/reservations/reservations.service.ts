import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { reservationDateInTimeZone } from './reservation-date';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async createReservation(restaurantId: string, dto: CreateReservationDto) {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const reservationDate = reservationDateInTimeZone(dto.date, dto.time, restaurant.timezone);

    const reservation = await this.prisma.reservation.create({
      data: {
        restaurantId,
        customerName: dto.name,
        customerEmail: dto.email.toLowerCase(),
        customerPhone: dto.phone.trim() || null,
        guestCount: dto.guests,
        reservationDate,
        notes: dto.notes || null,
        status: 'pending',
      },
    });

    await this.notificationService.publish({
      type: 'reservation.status_changed',
      restaurantId,
      customerEmail: reservation.customerEmail,
      payload: {
        reservationId: reservation.id,
        customerName: reservation.customerName,
        status: reservation.status,
        reservationDate: reservation.reservationDate.toISOString(),
        phone: dto.phone,
      },
    });

    return reservation;
  }
}
