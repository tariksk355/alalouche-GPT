import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessTokenPayload } from '../auth/token.service';
import { ok } from '../common/api-response';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';
import { UpdateAdminReservationStatusDto } from './dto/update-admin-reservation-status.dto';
import { AdminCustomersService } from './admin-customers.service';
import { CreateAdminCustomerDto } from './dto/create-admin-customer.dto';
import { UpdateAdminCustomerDto } from './dto/update-admin-customer.dto';
import { AdminMenuCatalogService } from './admin-menu-catalog.service';
import { CreateAdminMenuItemDto } from './dto/create-admin-menu-item.dto';
import { UpdateAdminMenuItemDto } from './dto/update-admin-menu-item.dto';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSettingsService } from './admin-settings.service';
import { UpdateAdminPrinterSettingsDto } from './dto/update-admin-printer-settings.dto';
import { AdminMarketingService } from './admin-marketing.service';
import { SendAdminMarketingEmailDto } from './dto/send-admin-marketing-email.dto';
import { AdminMenuImageStorageService } from './admin-menu-image-storage.service';
import { UploadedMenuImageFile } from './menu-image-upload.types';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
    private readonly adminMenuCatalogService: AdminMenuCatalogService,
    private readonly adminCustomersService: AdminCustomersService,
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly adminMarketingService: AdminMarketingService,
    private readonly adminMenuImageStorageService: AdminMenuImageStorageService,
  ) {}

  private requireAdmin(authorization?: string, adminToken?: string, legacyRestaurantId?: string): AccessTokenPayload {
    if (authorization?.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length);
      return this.authService.verifyAccessToken(bearer, 'admin');
    }

    if (!this.isLegacyHeaderAuthEnabled()) {
      throw new UnauthorizedException({
        error: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin bearer token is required. Legacy header-based admin auth is disabled.',
      });
    }

    // Legacy compatibility path (development-only and explicitly enabled): stub admin header token + explicit restaurant header.
    const expected = (process.env.ADMIN_TOKEN || 'dev-admin').trim();
    if (!adminToken || adminToken !== expected || !legacyRestaurantId) {
      throw new UnauthorizedException({
        error: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin bearer token is required. Legacy x-admin-token also requires x-restaurant-id.',
      });
    }

    return {
      sub: 'legacy-admin-token',
      role: 'admin',
      restaurantId: legacyRestaurantId,
      username: 'legacy_admin',
    };
  }

  private isLegacyHeaderAuthEnabled(): boolean {
    const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
    return nodeEnv !== 'production' && process.env.ALLOW_LEGACY_ADMIN_HEADERS === 'true';
  }


  @Get('analytics/overview')
  async getAnalyticsOverview(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const overview = await this.adminAnalyticsService.getOverview(auth.restaurantId);
    return ok(overview);
  }

  @Get('kpis')
  async getKpis(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const kpis = await this.ordersService.getDailyKpis(auth.restaurantId);
    return ok(kpis);
  }

  @Get('orders')
  async listOrders(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const orders = await this.ordersService.listAdminOrders(auth.restaurantId);
    return ok({ orders });
  }

  @Post('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAdminOrderStatusDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const order = await this.ordersService.updateStatus(auth.restaurantId, id, dto.status, dto.prepMinutes);
    return ok({ order });
  }

  @Get('reservations')
  async listReservations(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const reservations = await this.ordersService.listAdminReservations(auth.restaurantId);
    return ok({ reservations });
  }

  @Post('reservations/:id/status')
  async updateReservationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAdminReservationStatusDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const reservation = await this.ordersService.updateReservationStatus(auth.restaurantId, id, dto.status);
    return ok({ reservation });
  }


  @Get('settings/printer')
  async getPrinterSettings(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const settings = await this.adminSettingsService.getPrinterSettings(auth.restaurantId);
    return ok({ settings });
  }

  @Patch('settings/printer')
  async updatePrinterSettings(
    @Body() dto: UpdateAdminPrinterSettingsDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const settings = await this.adminSettingsService.updatePrinterSettings(auth.restaurantId, dto);
    return ok({ settings });
  }

  @Get('marketing/recipients')
  async listMarketingRecipients(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
    @Query('subscribed') subscribed?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const subscribedOnly = subscribed !== 'false';
    const recipients = await this.adminMarketingService.listRecipients(auth.restaurantId, subscribedOnly);
    return ok({ recipients, subscribed: subscribedOnly });
  }

  @Get('marketing/recipient-count')
  async getMarketingRecipientCount(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
    @Query('subscribed') subscribed?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const subscribedOnly = subscribed !== 'false';
    const count = await this.adminMarketingService.getRecipientCount(auth.restaurantId, subscribedOnly);
    return ok({ count, subscribed: subscribedOnly });
  }

  @Post('marketing/send-bulk-email')
  async sendMarketingBulkEmail(
    @Body() dto: SendAdminMarketingEmailDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const result = await this.adminMarketingService.sendBulkEmail(auth.restaurantId, dto);
    return ok(result);
  }

  @Get('customers')
  async listCustomers(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const customers = await this.adminCustomersService.listCustomers(auth.restaurantId);
    return ok({ customers });
  }

  @Post('customers')
  async createCustomer(
    @Body() dto: CreateAdminCustomerDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const customer = await this.adminCustomersService.createCustomer(auth.restaurantId, dto);
    return ok({ customer });
  }

  @Patch('customers/:id')
  async updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateAdminCustomerDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const customer = await this.adminCustomersService.updateCustomer(auth.restaurantId, id, dto);
    return ok({ customer });
  }

  @Delete('customers/:id')
  async deleteCustomer(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    await this.adminCustomersService.deleteCustomer(auth.restaurantId, id);
    return ok({ deleted: true });
  }

  @Get('menu-catalog')
  async listMenuCatalog(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const items = await this.adminMenuCatalogService.listMenuCatalog(auth.restaurantId);
    return ok({ items });
  }

  @Post('menu-catalog')
  async createMenuItem(
    @Body() dto: CreateAdminMenuItemDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const item = await this.adminMenuCatalogService.createMenuItem(auth.restaurantId, dto);
    return ok({ item });
  }

  @Post('menu-catalog/images/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: parseInt(process.env.S3_UPLOAD_MAX_BYTES || '', 10) || 5 * 1024 * 1024,
      },
    }),
  )
  async uploadMenuImage(
    @UploadedFile() file: UploadedMenuImageFile,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    if (!file) {
      throw new BadRequestException({
        error: 'IMAGE_FILE_REQUIRED',
        message: 'No image file provided.',
      });
    }

    const image = await this.adminMenuImageStorageService.uploadMenuImage(auth.restaurantId, file);
    return ok({ imageUrl: image.url, key: image.key });
  }

  @Patch('menu-catalog/:id')
  async updateMenuItem(
    @Param('id') id: string,
    @Body() dto: UpdateAdminMenuItemDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const existingItems = await this.adminMenuCatalogService.listMenuCatalog(auth.restaurantId);
    const existing = existingItems.find((item) => item.id === id);
    const item = await this.adminMenuCatalogService.updateMenuItem(auth.restaurantId, id, dto);

    const imageReplaced =
      dto.imageUrl !== undefined
      && existing?.imageUrl
      && existing.imageUrl !== item.imageUrl;

    if (imageReplaced) {
      await this.adminMenuImageStorageService.deleteMenuImageIfManaged(auth.restaurantId, existing.imageUrl).catch(() => {
        // Non-blocking cleanup: preserve successful menu update if storage deletion fails.
      });
    }

    return ok({ item });
  }

  @Delete('menu-catalog/:id')
  async deleteMenuItem(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    await this.adminMenuCatalogService.deleteMenuItem(auth.restaurantId, id);
    return ok({ deleted: true });
  }
}
