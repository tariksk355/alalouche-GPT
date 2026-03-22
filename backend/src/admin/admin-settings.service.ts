import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAdminPrinterSettingsDto } from './dto/update-admin-printer-settings.dto';
import { UpdateAdminBrandingSettingsDto } from './dto/update-admin-branding-settings.dto';
import { UpdateAdminStorefrontAnnouncementDto } from './dto/update-admin-storefront-announcement.dto';

export interface PrinterSettings {
  auto_print: boolean;
  paper_width: '58mm' | '80mm';
  copies: number;
  default_prep_time: 15 | 30 | 45 | 60;
  require_prep_time: boolean;
}

export interface BrandingSettings {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  tagline: string | null;
}

export interface StorefrontAnnouncementSettings {
  active: boolean;
  message: string | null;
}

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  auto_print: true,
  paper_width: '58mm',
  copies: 1,
  default_prep_time: 30,
  require_prep_time: true,
};

const DEFAULT_STOREFRONT_ANNOUNCEMENT_SETTINGS: StorefrontAnnouncementSettings = {
  active: false,
  message: null,
};

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrinterSettings(restaurantId: string): Promise<PrinterSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Prisma.JsonObject | null) || {};
    const printerSettings = (orderingSettings.printerSettings as Record<string, unknown> | null) || {};

    return this.normalizePrinterSettings(printerSettings);
  }

  async updatePrinterSettings(restaurantId: string, dto: UpdateAdminPrinterSettingsDto): Promise<PrinterSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Prisma.JsonObject | null) || {};
    const existingPrinterSettings = (orderingSettings.printerSettings as Record<string, unknown> | null) || {};

    const next = this.normalizePrinterSettings({
      ...existingPrinterSettings,
      ...(dto.auto_print !== undefined ? { auto_print: dto.auto_print } : {}),
      ...(dto.paper_width !== undefined ? { paper_width: dto.paper_width } : {}),
      ...(dto.copies !== undefined ? { copies: dto.copies } : {}),
      ...(dto.default_prep_time !== undefined ? { default_prep_time: dto.default_prep_time } : {}),
      ...(dto.require_prep_time !== undefined ? { require_prep_time: dto.require_prep_time } : {}),
    });

    const nextOrderingSettings: Prisma.InputJsonObject = {
      ...orderingSettings,
      printerSettings: { ...next } as Prisma.InputJsonObject,
    };

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        orderingSettings: nextOrderingSettings,
      },
    });

    return next;
  }

  async getBrandingSettings(restaurantId: string): Promise<BrandingSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    return this.normalizeBrandingSettings(restaurant.branding, restaurant.name);
  }

  async updateBrandingSettings(restaurantId: string, dto: UpdateAdminBrandingSettingsDto): Promise<BrandingSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const existing = this.normalizeBrandingSettings(restaurant.branding, restaurant.name);
    const next: BrandingSettings = {
      ...existing,
      ...(dto.logoUrl !== undefined ? { logoUrl: this.normalizeOptionalString(dto.logoUrl) } : {}),
    };

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        branding: next as unknown as Prisma.InputJsonObject,
      },
    });

    return next;
  }

  async getStorefrontAnnouncementSettings(restaurantId: string): Promise<StorefrontAnnouncementSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Prisma.JsonObject | null) || {};
    const announcement = (orderingSettings.storefrontAnnouncement as Record<string, unknown> | null) || {};

    return this.normalizeStorefrontAnnouncementSettings(announcement);
  }

  async updateStorefrontAnnouncementSettings(
    restaurantId: string,
    dto: UpdateAdminStorefrontAnnouncementDto,
  ): Promise<StorefrontAnnouncementSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Prisma.JsonObject | null) || {};
    const existingAnnouncement = (orderingSettings.storefrontAnnouncement as Record<string, unknown> | null) || {};

    const next = this.normalizeStorefrontAnnouncementSettings({
      ...existingAnnouncement,
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.message !== undefined ? { message: dto.message } : {}),
    });

    const nextOrderingSettings: Prisma.InputJsonObject = {
      ...orderingSettings,
      storefrontAnnouncement: { ...next } as Prisma.InputJsonObject,
    };

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        orderingSettings: nextOrderingSettings,
      },
    });

    return next;
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeColor(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
  }

  private getDefaultBrandingSettings(restaurantName: string): BrandingSettings {
    const trimmedName = restaurantName.trim();
    return {
      logoUrl: null,
      primaryColor: '#b5122a',
      secondaryColor: '#111827',
      accentColor: '#b5122a',
      tagline: trimmedName || 'Restaurant',
    };
  }

  private normalizeBrandingSettings(raw: unknown, restaurantName: string): BrandingSettings {
    const defaults = this.getDefaultBrandingSettings(restaurantName);
    const branding = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

    return {
      logoUrl: this.normalizeOptionalString(branding.logoUrl) || defaults.logoUrl,
      primaryColor: this.normalizeColor(branding.primaryColor, defaults.primaryColor),
      secondaryColor: this.normalizeColor(branding.secondaryColor, defaults.secondaryColor),
      accentColor: this.normalizeColor(branding.accentColor, defaults.accentColor),
      tagline: this.normalizeOptionalString(branding.tagline) || defaults.tagline,
    };
  }

  private normalizeStorefrontAnnouncementSettings(raw: Record<string, unknown>): StorefrontAnnouncementSettings {
    const message = this.normalizeOptionalString(raw.message);
    const active = raw.active === true && Boolean(message);

    return {
      active: active || DEFAULT_STOREFRONT_ANNOUNCEMENT_SETTINGS.active,
      message: message || DEFAULT_STOREFRONT_ANNOUNCEMENT_SETTINGS.message,
    };
  }

  private normalizePrinterSettings(raw: Record<string, unknown>): PrinterSettings {
    const paperWidth = raw.paper_width === '80mm' ? '80mm' : '58mm';
    const defaultPrep = [15, 30, 45, 60].includes(Number(raw.default_prep_time))
      ? (Number(raw.default_prep_time) as 15 | 30 | 45 | 60)
      : DEFAULT_PRINTER_SETTINGS.default_prep_time;

    return {
      auto_print: raw.auto_print !== false,
      paper_width: paperWidth,
      copies: [1, 2, 3].includes(Number(raw.copies)) ? Number(raw.copies) : DEFAULT_PRINTER_SETTINGS.copies,
      default_prep_time: defaultPrep,
      require_prep_time: raw.require_prep_time !== false,
    };
  }
}
