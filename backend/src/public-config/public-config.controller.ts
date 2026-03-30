import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { PublicConfigService } from './public-config.service';
import { AdminMediaStorageService } from '../admin/admin-media-storage.service';

@Controller('public')
export class PublicConfigController {
  constructor(
    private readonly publicConfigService: PublicConfigService,
    private readonly adminMediaStorageService: AdminMediaStorageService,
  ) {}

  @Get('restaurant-config')
  @UseGuards(TenantContextGuard)
  async getFromHost(@TenantCtx() tenant: TenantContext) {
    const restaurant = await this.publicConfigService.getRestaurantConfig(tenant.restaurantId);
    return ok({ restaurant, tenantSource: tenant.source });
  }

  @Get('restaurants/:restaurantSlug/config')
  @UseGuards(TenantContextGuard)
  async getFromSlug(@TenantCtx() tenant: TenantContext) {
    const restaurant = await this.publicConfigService.getRestaurantConfig(tenant.restaurantId);
    return ok({ restaurant, tenantSource: tenant.source });
  }

  @Get('menu-catalog')
  @UseGuards(TenantContextGuard)
  async getMenuCatalog(@TenantCtx() tenant: TenantContext) {
    const items = await this.publicConfigService.getMenuCatalog(tenant.restaurantId);
    return ok({ items, tenantSource: tenant.source });
  }

  @Post('visit')
  @UseGuards(TenantContextGuard)
  async trackVisit(@TenantCtx() tenant: TenantContext) {
    await this.publicConfigService.recordStorefrontVisit(tenant.restaurantId);
    return ok({ tracked: true });
  }

  @Get('media')
  async getMedia(
    @Query('key') key: string,
    @Res() response: Response,
  ) {
    const media = await this.adminMediaStorageService.getMediaObject(key);
    response.setHeader('Content-Type', media.contentType || 'application/octet-stream');
    response.setHeader('Cache-Control', media.cacheControl || 'public, max-age=31536000, immutable');
    response.send(media.body);
  }
}
