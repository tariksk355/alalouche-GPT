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
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
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
import { UpdateAdminMenuCategoryOrderDto } from './dto/update-admin-menu-category-order.dto';
import { UpdateAdminMenuProductOrderByCategoryDto } from './dto/update-admin-menu-product-order-by-category.dto';
import { DeleteAdminMenuCategoryDto } from './dto/delete-admin-menu-category.dto';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSettingsService } from './admin-settings.service';
import { UpdateAdminPrinterSettingsDto } from './dto/update-admin-printer-settings.dto';
import { UpdateAdminBrandingSettingsDto } from './dto/update-admin-branding-settings.dto';
import { UpdateAdminStorefrontAnnouncementDto } from './dto/update-admin-storefront-announcement.dto';
import { AdminMarketingService } from './admin-marketing.service';
import { SendAdminMarketingEmailDto } from './dto/send-admin-marketing-email.dto';
import { UpsertAdminPromotionDto } from './dto/upsert-admin-promotion.dto';
import { AdminMediaStorageService } from './admin-media-storage.service';
import { UploadedMenuImageFile } from './menu-image-upload.types';

const ADMIN_IMAGE_UPLOAD_OPTIONS = {
  storage: memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.S3_UPLOAD_MAX_BYTES || '', 10) || 5 * 1024 * 1024,
  },
};

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
    private readonly adminMediaStorageService: AdminMediaStorageService,
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

  private buildPublicMediaUrl(request: Request, key: string): string {
    const configuredOrigin = [
      process.env.MEDIA_PUBLIC_BASE_URL,
    ]
      .map((value) => value?.trim())
      .find(Boolean)
      ?.replace(/\/$/, '');

    if (configuredOrigin) {
      return `${configuredOrigin}/public/media?key=${encodeURIComponent(key)}`;
    }

    const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = request.header('x-forwarded-host')?.split(',')[0]?.trim();
    const protocol = forwardedProto || request.protocol || 'https';
    const host = forwardedHost || request.get('host');
    if (!host) {
      throw new UnauthorizedException({
        error: 'PUBLIC_HOST_REQUIRED',
        message: 'Unable to resolve a public host for media delivery.',
      });
    }

    const origin = `${protocol}://${host}`;
    return `${origin}/public/media?key=${encodeURIComponent(key)}`;
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
    @Query('includeHidden') includeHidden?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const orders = await this.ordersService.listAdminOrders(auth.restaurantId, {
      includeHidden: includeHidden === 'true',
    });
    return ok({ orders });
  }

  @Post('orders/:id/hide')
  async hideOrderFromAdminView(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const order = await this.ordersService.hideAdminOrder(auth.restaurantId, id);
    return ok({ order });
  }

  @Post('orders/:id/restore')
  async restoreOrderToAdminView(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const order = await this.ordersService.restoreAdminOrder(auth.restaurantId, id);
    return ok({ order });
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
    @Query('includeHidden') includeHidden?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const reservations = await this.ordersService.listAdminReservations(auth.restaurantId, {
      includeHidden: includeHidden === 'true',
    });
    return ok({ reservations });
  }

  @Post('reservations/:id/hide')
  async hideReservationFromAdminView(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const reservation = await this.ordersService.hideAdminReservation(auth.restaurantId, id);
    return ok({ reservation });
  }

  @Post('reservations/:id/restore')
  async restoreReservationToAdminView(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const reservation = await this.ordersService.restoreAdminReservation(auth.restaurantId, id);
    return ok({ reservation });
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


  @Get('settings/branding')
  async getBrandingSettings(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const settings = await this.adminSettingsService.getBrandingSettings(auth.restaurantId);
    return ok({ settings });
  }

  @Patch('settings/branding')
  async updateBrandingSettings(
    @Body() dto: UpdateAdminBrandingSettingsDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const previous = await this.adminSettingsService.getBrandingSettings(auth.restaurantId);
    const settings = await this.adminSettingsService.updateBrandingSettings(auth.restaurantId, dto);

    if (previous.logoUrl && previous.logoUrl !== settings.logoUrl) {
      void this.adminMediaStorageService.deleteBrandingLogoIfManaged(auth.restaurantId, previous.logoUrl).catch(() => undefined);
    }

    return ok({ settings });
  }

  @Post('settings/branding/logo/upload')
  @UseInterceptors(FileInterceptor('file', ADMIN_IMAGE_UPLOAD_OPTIONS))
  async uploadBrandingLogo(
    @UploadedFile() file: UploadedMenuImageFile,
    @Req() request: Request,
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

    const existing = await this.adminSettingsService.getBrandingSettings(auth.restaurantId);
    const image = await this.adminMediaStorageService.uploadBrandingLogo(auth.restaurantId, file);
    const publicMediaUrl = this.buildPublicMediaUrl(request, image.key);
    const settings = await this.adminSettingsService.updateBrandingSettings(auth.restaurantId, { logoUrl: publicMediaUrl });

    if (existing.logoUrl && existing.logoUrl !== publicMediaUrl) {
      await this.adminMediaStorageService.deleteBrandingLogoIfManaged(auth.restaurantId, existing.logoUrl).catch(() => {
        // Non-blocking cleanup: preserve the successful branding update if storage deletion fails.
      });
    }

    return ok({ settings, upload: { ...image, url: publicMediaUrl } });
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

  @Get('settings/storefront-announcement')
  async getStorefrontAnnouncementSettings(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const settings = await this.adminSettingsService.getStorefrontAnnouncementSettings(auth.restaurantId);
    return ok({ settings });
  }

  @Patch('settings/storefront-announcement')
  async updateStorefrontAnnouncementSettings(
    @Body() dto: UpdateAdminStorefrontAnnouncementDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const settings = await this.adminSettingsService.updateStorefrontAnnouncementSettings(auth.restaurantId, dto);
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

  @Get('marketing/promotions')
  async listMarketingPromotions(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const promotions = await this.adminMarketingService.listPromotions(auth.restaurantId, { search, status });
    return ok({ promotions });
  }

  @Post('marketing/promotions')
  async createMarketingPromotion(
    @Body() dto: UpsertAdminPromotionDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const promotion = await this.adminMarketingService.createPromotion(auth.restaurantId, dto);
    return ok({ promotion });
  }

  @Patch('marketing/promotions/:promotionId')
  async updateMarketingPromotion(
    @Param('promotionId') promotionId: string,
    @Body() dto: UpsertAdminPromotionDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const promotion = await this.adminMarketingService.updatePromotion(auth.restaurantId, promotionId, dto);
    return ok({ promotion });
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
  @UseInterceptors(FileInterceptor('file', ADMIN_IMAGE_UPLOAD_OPTIONS))
  async uploadMenuImage(
    @UploadedFile() file: UploadedMenuImageFile,
    @Req() request: Request,
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

    const image = await this.adminMediaStorageService.uploadMenuImage(auth.restaurantId, file);
    const publicMediaUrl = this.buildPublicMediaUrl(request, image.key);
    return ok({ imageUrl: publicMediaUrl, key: image.key });
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
      await this.adminMediaStorageService.deleteMenuImageIfManaged(auth.restaurantId, existing.imageUrl).catch(() => {
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

  @Get('menu-catalog/categories/order')
  async getMenuCategoryOrder(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const categoryOrder = await this.adminMenuCatalogService.getCategoryOrder(auth.restaurantId);
    return ok({ categoryOrder });
  }

  @Patch('menu-catalog/categories/order')
  async updateMenuCategoryOrder(
    @Body() dto: UpdateAdminMenuCategoryOrderDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const categoryOrder = await this.adminMenuCatalogService.updateCategoryOrder(auth.restaurantId, dto.categoryOrder || []);
    return ok({ categoryOrder });
  }

  @Get('menu-catalog/products/order-by-category')
  async getMenuProductOrderByCategory(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const productOrderByCategory = await this.adminMenuCatalogService.getProductOrderByCategory(auth.restaurantId);
    return ok({ productOrderByCategory });
  }

  @Patch('menu-catalog/products/order-by-category')
  async updateMenuProductOrderByCategory(
    @Body() dto: UpdateAdminMenuProductOrderByCategoryDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const productOrderByCategory = await this.adminMenuCatalogService.updateProductOrderByCategory(
      auth.restaurantId,
      dto.productOrderByCategory || {},
    );
    return ok({ productOrderByCategory });
  }

  @Post('menu-catalog/categories/delete')
  async deleteMenuCategory(
    @Body() dto: DeleteAdminMenuCategoryDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const result = await this.adminMenuCatalogService.deleteCategory(
      auth.restaurantId,
      dto.category,
      dto.targetCategory,
      dto.clearCategory === true,
    );
    return ok(result);
  }
}
