import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({ providers: [OrdersService], exports: [OrdersService], imports: [NotificationModule] })
export class OrdersModule {}