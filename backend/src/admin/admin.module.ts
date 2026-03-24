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
import { AdminMediaStorageService } from './admin-media-storage.service';
import { PublicConfigModule } from '../public-config/public-config.module';

@Module({
  imports: [OrdersModule, AuthModule, PrismaModule, NotificationModule, PublicConfigModule],
  controllers: [AdminController],
  providers: [
    AdminMenuCatalogService,
    AdminCustomersService,
    AdminAnalyticsService,
    AdminSettingsService,
    AdminMarketingService,
    AdminMediaStorageService,
  ],
})
export class AdminModule {}
