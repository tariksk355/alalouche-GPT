import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { NotificationModule } from '../notifications/notification.module';
import { OrdersController } from './orders.controller';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  providers: [OrdersService],
  exports: [OrdersService],
  imports: [NotificationModule, AuthModule, TenantModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
