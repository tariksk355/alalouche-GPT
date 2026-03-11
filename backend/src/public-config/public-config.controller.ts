import { Controller, Get, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { PublicConfigService } from './public-config.service';

@Controller('public')
export class PublicConfigController {
  constructor(private readonly publicConfigService: PublicConfigService) {}

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
}
