import { Module } from '@nestjs/common';
import { NotificationModule } from '../notifications/notification.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}