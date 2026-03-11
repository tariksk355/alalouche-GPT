import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenuCatalog(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Record<string, unknown> | null) || {};
    const rawItems = Array.isArray(orderingSettings.menuCatalog) ? orderingSettings.menuCatalog : [];

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

  async getRestaurantConfig(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

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
}
