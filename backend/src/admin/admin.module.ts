import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { AdminController } from './admin.controller';
import { AdminMenuCatalogService } from './admin-menu-catalog.service';
import { AdminCustomersService } from './admin-customers.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminMarketingService } from './admin-marketing.service';
import { AdminMenuImageStorageService } from './admin-menu-image-storage.service';

@Module({
  imports: [OrdersModule, AuthModule, PrismaModule, NotificationModule],
  controllers: [AdminController],
  providers: [
    AdminMenuCatalogService,
    AdminCustomersService,
    AdminAnalyticsService,
    AdminSettingsService,
    AdminMarketingService,
    AdminMenuImageStorageService,
  ],
})
export class AdminModule {}
