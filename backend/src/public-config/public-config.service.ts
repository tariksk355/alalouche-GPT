import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PublicConfigService {
  private static readonly RESTAURANT_CONFIG_TTL_SECONDS = 60;
  private static readonly MENU_CATALOG_TTL_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getMenuCatalog(restaurantId: string) {
    const cacheKey = this.getMenuCatalogCacheKey(restaurantId);
    const cached = await this.redisService.getJson<ReturnType<PublicConfigService['mapMenuCatalogItems']>>(cacheKey);
    if (cached) {
      return cached;
    }

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Record<string, unknown> | null) || {};
    const rawItems = Array.isArray(orderingSettings.menuCatalog) ? orderingSettings.menuCatalog : [];

    const items = this.mapMenuCatalogItems(rawItems);
    await this.redisService.setJson(cacheKey, items, PublicConfigService.MENU_CATALOG_TTL_SECONDS);
    return items;
  }

  async getRestaurantConfig(restaurantId: string) {
    const cacheKey = this.getRestaurantConfigCacheKey(restaurantId);
    const cached = await this.redisService.getJson<ReturnType<PublicConfigService['buildRestaurantConfig']>>(cacheKey);
    if (cached) {
      return cached;
    }

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const config = this.buildRestaurantConfig(restaurant);
    await this.redisService.setJson(cacheKey, config, PublicConfigService.RESTAURANT_CONFIG_TTL_SECONDS);
    return config;
  }

  async invalidateRestaurantConfigCache(restaurantId: string) {
    await this.redisService.deleteKeys(this.getRestaurantConfigCacheKey(restaurantId));
  }

  async invalidateMenuCatalogCache(restaurantId: string) {
    await this.redisService.deleteKeys(
      this.getMenuCatalogCacheKey(restaurantId),
      this.getRestaurantConfigCacheKey(restaurantId),
    );
  }

  private getRestaurantConfigCacheKey(restaurantId: string) {
    return `cache:public:restaurant-config:${restaurantId}`;
  }

  private getMenuCatalogCacheKey(restaurantId: string) {
    return `cache:public:menu-catalog:${restaurantId}`;
  }

  private buildRestaurantConfig(restaurant: any) {
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      status: restaurant.status,
      branding: restaurant.branding,
      contactInfo: restaurant.contactInfo,
      locale: restaurant.locale,
      timezone: restaurant.timezone,
      currency: restaurant.currency,
      capabilities: restaurant.capabilities,
      orderingSettings: restaurant.orderingSettings,
      reservationSettings: restaurant.reservationSettings,
    };
  }

  private mapMenuCatalogItems(rawItems: unknown[]) {
    return rawItems
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id || ''),
          name: String(row.name || ''),
          description: row.description ? String(row.description) : null,
          price: Number(row.price || 0),
          category: row.category ? String(row.category) : 'Autres',
          imageUrl: row.imageUrl ? String(row.imageUrl) : null,
          allergens: row.allergens ? String(row.allergens) : null,
          available: row.available !== false,
          sortOrder: Number(row.sortOrder || 0),
        };
      })
      .filter((item) => item.id && item.name && item.available)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
