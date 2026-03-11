import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async createReservation(restaurantId: string, dto: CreateReservationDto) {
    const reservationDate = new Date(`${dto.date}T${dto.time}:00`);

    const reservation = await this.prisma.reservation.create({
      data: {
        restaurantId,
        customerName: dto.name,
        customerEmail: dto.email.toLowerCase(),
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
