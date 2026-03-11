import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicConfigService {
  constructor(private readonly prisma: PrismaService) {}

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
