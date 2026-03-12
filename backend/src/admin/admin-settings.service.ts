import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAdminPrinterSettingsDto } from './dto/update-admin-printer-settings.dto';

export interface PrinterSettings {
  auto_print: boolean;
  paper_width: '58mm' | '80mm';
  copies: number;
  default_prep_time: 15 | 30 | 45 | 60;
  require_prep_time: boolean;
}

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  auto_print: true,
  paper_width: '58mm',
  copies: 1,
  default_prep_time: 30,
  require_prep_time: true,
};

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrinterSettings(restaurantId: string): Promise<PrinterSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Record<string, unknown> | null) || {};
    const printerSettings = (orderingSettings.printerSettings as Record<string, unknown> | null) || {};

    return this.normalizePrinterSettings(printerSettings);
  }

  async updatePrinterSettings(restaurantId: string, dto: UpdateAdminPrinterSettingsDto): Promise<PrinterSettings> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException({ error: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
    }

    const orderingSettings = (restaurant.orderingSettings as Record<string, unknown> | null) || {};
    const existingPrinterSettings = (orderingSettings.printerSettings as Record<string, unknown> | null) || {};

    const next = this.normalizePrinterSettings({
      ...existingPrinterSettings,
      ...(dto.auto_print !== undefined ? { auto_print: dto.auto_print } : {}),
      ...(dto.paper_width !== undefined ? { paper_width: dto.paper_width } : {}),
      ...(dto.copies !== undefined ? { copies: dto.copies } : {}),
      ...(dto.default_prep_time !== undefined ? { default_prep_time: dto.default_prep_time } : {}),
      ...(dto.require_prep_time !== undefined ? { require_prep_time: dto.require_prep_time } : {}),
    });

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        orderingSettings: {
          ...orderingSettings,
          printerSettings: next as unknown,
        } as unknown,
      },
    });

    return next;
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
