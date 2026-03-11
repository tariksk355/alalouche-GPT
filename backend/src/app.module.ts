import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { DeviceAuthModule } from './device-auth/device-auth.module';
import { DevicePairingModule } from './device-pairing/device-pairing.module';
import { DevicesModule } from './devices/devices.module';
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notifications/notification.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicConfigModule } from './public-config/public-config.module';
import { ReceiverModule } from './receiver/receiver.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    DeviceAuthModule,
    DevicesModule,
    DevicePairingModule,
    NotificationModule,
    OrdersModule,
    ReservationsModule,
    ReceiverModule,
    AdminModule,
    PublicConfigModule,
  ],
})
export class AppModule {}