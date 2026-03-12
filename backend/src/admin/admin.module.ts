import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminController } from './admin.controller';
import { AdminMenuCatalogService } from './admin-menu-catalog.service';

@Module({
  imports: [OrdersModule, AuthModule, PrismaModule],
  controllers: [AdminController],
  providers: [AdminMenuCatalogService],
})
export class AdminModule {}