import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminMenuItemDto } from './dto/create-admin-menu-item.dto';
import { UpdateAdminMenuItemDto } from './dto/update-admin-menu-item.dto';
import { PublicConfigService } from '../public-config/public-config.service';

type MenuCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  imageUrl: string | null;
  allergens: string | null;
  available: boolean;
  sortOrder: number;
};

@Injectable()
export class AdminMenuCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicConfigService: PublicConfigService,
  ) {}

  async listMenuCatalog(restaurantId: string): Promise<MenuCatalogItem[]> {
    const restaurant = await this.getRestaurant(restaurantId);
    return this.readMenuCatalog(restaurant.orderingSettings);
  }

  async createMenuItem(restaurantId: string, dto: CreateAdminMenuItemDto): Promise<MenuCatalogItem> {
    const restaurant = await this.getRestaurant(restaurantId);
    const current = this.readMenuCatalog(restaurant.orderingSettings);
    const sortOrder = current.length > 0 ? Math.max(...current.map((item) => item.sortOrder)) + 1 : 0;

    const created: MenuCatalogItem = {
      id: randomUUID(),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      price: Number(dto.price),
      category: dto.category?.trim() || 'Autres',
      imageUrl: dto.imageUrl?.trim() || null,
      allergens: dto.allergens?.trim() || null,
      available: dto.available !== false,
      sortOrder,
    };

    await this.persistMenuCatalog(restaurantId, restaurant.orderingSettings, [...current, created]);
    await this.publicConfigService.invalidateMenuCatalogCache(restaurantId);
    return created;
  }

  async updateMenuItem(restaurantId: string, itemId: string, dto: UpdateAdminMenuItemDto): Promise<MenuCatalogItem> {
    const restaurant = await this.getRestaurant(restaurantId);
    const current = this.readMenuCatalog(restaurant.orderingSettings);
    const idx = current.findIndex((item) => item.id === itemId);
    if (idx < 0) {
      throw new NotFoundException({ error: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found.' });
    }

    const existing = current[idx];
    const updated: MenuCatalogItem = {
      ...existing,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.price !== undefined ? { price: Number(dto.price) } : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() || 'Autres' } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl.trim() || null } : {}),
      ...(dto.allergens !== undefined ? { allergens: dto.allergens.trim() || null } : {}),
      ...(dto.available !== undefined ? { available: dto.available } : {}),
    };

    const next = [...current];
    next[idx] = updated;
    await this.persistMenuCatalog(restaurantId, restaurant.orderingSettings, next);
    await this.publicConfigService.invalidateMenuCatalogCache(restaurantId);
    return updated;
  }

  async deleteMenuItem(restaurantId: string, itemId: string): Promise<void> {
    const restaurant = await this.getRestaurant(restaurantId);
    const current = this.readMenuCatalog(restaurant.orderingSettings);
    const next = current.filter((item) => item.id !== itemId);
    if (next.length === current.length) {
      throw new NotFoundException({ error: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found.' });
    }

    await this.persistMenuCatalog(restaurantId, restaurant.orderingSettings, next.map((item, index) => ({ ...item, sortOrder: index })));
    await this.publicConfigService.invalidateMenuCatalogCache(restaurantId);
  }

  async getCategoryOrder(restaurantId: string): Promise<string[]> {
    const restaurant = await this.getRestaurant(restaurantId);
    return this.readCategoryOrder(restaurant.orderingSettings);
  }

  async updateCategoryOrder(restaurantId: string, categoryOrder: string[] = []): Promise<string[]> {
    const restaurant = await this.getRestaurant(restaurantId);
    const normalized = Array.from(new Set(categoryOrder.map((value) => value.trim()).filter(Boolean)));
    const current = (restaurant.orderingSettings as Record<string, unknown> | null) || {};
    await this.persistOrderingSettings(restaurantId, {
      ...current,
      categoryOrder: normalized,
    });
    await this.publicConfigService.invalidateMenuCatalogCache(restaurantId);
    return normalized;
  }

  async deleteCategory(
    restaurantId: string,
    category: string,
    targetCategory?: string,
    clearCategory = false,
  ): Promise<{ items: MenuCatalogItem[]; categoryOrder: string[]; affectedCount: number }> {
    const fromCategory = category.trim();
    const toCategory = targetCategory?.trim() || '';
    if (!fromCategory) {
      throw new BadRequestException({ error: 'CATEGORY_REQUIRED', message: 'Category is required.' });
    }
    if (!toCategory && !clearCategory) {
      throw new BadRequestException({
        error: 'CATEGORY_DELETE_ACTION_REQUIRED',
        message: 'Choose a target category or clear the category.',
      });
    }

    const restaurant = await this.getRestaurant(restaurantId);
    const current = this.readMenuCatalog(restaurant.orderingSettings);
    const affectedCount = current.filter((item) => item.category === fromCategory).length;
    const replacement = toCategory || '';
    const nextItems = current.map((item) =>
      item.category === fromCategory
        ? { ...item, category: replacement }
        : item,
    );
    const currentSettings = (restaurant.orderingSettings as Record<string, unknown> | null) || {};
    const currentOrder = this.readCategoryOrder(restaurant.orderingSettings);
    const nextOrder = currentOrder.filter((value) => value !== fromCategory);
    if (toCategory && !nextOrder.includes(toCategory)) {
      nextOrder.push(toCategory);
    }
    await this.persistOrderingSettings(restaurantId, {
      ...currentSettings,
      menuCatalog: nextItems,
      categoryOrder: nextOrder,
    });
    await this.publicConfigService.invalidateMenuCatalogCache(restaurantId);
    return { items: nextItems, categoryOrder: nextOrder, affectedCount };
  }

  private async getRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    return restaurant;
  }

  private readMenuCatalog(orderingSettings: unknown): MenuCatalogItem[] {
    const settings = (orderingSettings as Record<string, unknown> | null) || {};
    const rawItems = Array.isArray(settings.menuCatalog) ? settings.menuCatalog : [];

    return rawItems
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => {
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
          sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index,
        };
      })
      .filter((item) => item.id && item.name)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private readCategoryOrder(orderingSettings: unknown): string[] {
    const settings = (orderingSettings as Record<string, unknown> | null) || {};
    const rawOrder = Array.isArray(settings.categoryOrder) ? settings.categoryOrder : [];
    return Array.from(
      new Set(
        rawOrder
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean),
      ),
    );
  }

  private async persistMenuCatalog(restaurantId: string, orderingSettings: unknown, items: MenuCatalogItem[]) {
    const current = (orderingSettings as Record<string, unknown> | null) || {};

    await this.persistOrderingSettings(restaurantId, {
      ...current,
      menuCatalog: items,
    });
  }

  private async persistOrderingSettings(restaurantId: string, orderingSettings: Record<string, unknown>) {
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        orderingSettings: orderingSettings as Prisma.InputJsonValue,
      },
    });
  }
}
