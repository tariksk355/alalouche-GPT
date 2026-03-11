import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [OrdersModule, AuthModule],
  controllers: [AdminController],
})
export class AdminModule {}