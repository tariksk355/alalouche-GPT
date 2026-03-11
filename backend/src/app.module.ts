import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { DevicePairingModule } from './device-pairing/device-pairing.module';
import { DevicesModule } from './devices/devices.module';
import { ReceiverModule } from './receiver/receiver.module';
import { DeviceAuthModule } from './device-auth/device-auth.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    DeviceAuthModule,
    DevicesModule,
    DevicePairingModule,
    NotificationModule,
    OrdersModule,
    ReceiverModule,
    AdminModule,
  ],
})
export class AppModule {}