import { Body, Controller, Post } from '@nestjs/common';
import { ok } from '../common/api-response';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  async create(@Body() dto: CreateReservationDto) {
    const reservation = await this.reservationsService.createReservation(dto);
    return ok({ reservation });
  }
}