import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SendAdminMarketingEmailDto } from './dto/send-admin-marketing-email.dto';
import { UpsertAdminPromotionDto } from './dto/upsert-admin-promotion.dto';

@Injectable()
export class AdminMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async listRecipients(restaurantId: string, subscribed: boolean) {
    return this.prisma.customer.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        subscribedEmail: subscribed,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        subscribedEmail: true,
        createdAt: true,
      },
      take: 5000,
    });
  }

  async getRecipientCount(restaurantId: string, subscribed: boolean) {
    return this.prisma.customer.count({
      where: {
        restaurantId,
        deletedAt: null,
        subscribedEmail: subscribed,
      },
    });
  }

  async listPromotions(restaurantId: string, query?: { search?: string; status?: string }) {
    const search = query?.search?.trim();
    const status = query?.status?.trim().toLowerCase();

    return this.prisma.promotion.findMany({
      where: {
        restaurantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(status === 'active'
          ? { isActive: true }
          : status === 'inactive'
            ? { isActive: false }
            : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        code: true,
        discountType: true,
        discountValue: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        usageLimit: true,
        perCustomerLimit: true,
        usageCount: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 200,
    });
  }

  async createPromotion(restaurantId: string, dto: UpsertAdminPromotionDto) {
    const input = this.normalizePromotionInput(dto);

    try {
      return await this.prisma.promotion.create({
        data: {
          restaurantId,
          ...input,
        },
      });
    } catch (error) {
      this.handlePromotionWriteError(error);
    }
  }

  async updatePromotion(restaurantId: string, promotionId: string, dto: UpsertAdminPromotionDto) {
    await this.assertPromotionExists(restaurantId, promotionId);
    const input = this.normalizePromotionInput(dto);

    try {
      return await this.prisma.promotion.update({
        where: { id: promotionId },
        data: input,
      });
    } catch (error) {
      this.handlePromotionWriteError(error);
    }
  }

  async sendBulkEmail(restaurantId: string, dto: SendAdminMarketingEmailDto) {
    const excludedCustomerIds = Array.from(new Set((dto.excludedCustomerIds || []).filter(Boolean)));
    const attachedPromotion = dto.promotionId
      ? await this.getPromotionForCampaign(restaurantId, dto.promotionId)
      : null;

    const subscribedTotal = await this.prisma.customer.count({
      where: {
        restaurantId,
        deletedAt: null,
        subscribedEmail: true,
      },
    });

    const recipients = await this.prisma.customer.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        subscribedEmail: true,
        ...(excludedCustomerIds.length > 0 ? { id: { notIn: excludedCustomerIds } } : {}),
      },
      select: {
        id: true,
        email: true,
      },
      take: 5000,
    });

    const recipientEmails = recipients.map((row: (typeof recipients)[number]) => row.email).filter((email: string) => Boolean(email));
    const effectiveExcludedCount = Math.max(subscribedTotal - recipients.length, 0);
    const result = await this.notificationService.sendMarketingBulkEmail({
      restaurantId,
      subject: dto.subject,
      body: dto.body,
      recipientEmails,
    });

    return {
      subscribedTotal,
      excludedCount: effectiveExcludedCount,
      recipientsMatched: recipients.length,
      recipientsDispatched: result.dispatchedCount,
      provider: result.provider,
      status: result.status,
      note: result.note,
      promotion: attachedPromotion
        ? {
            id: attachedPromotion.id,
            name: attachedPromotion.name,
            code: attachedPromotion.code,
          }
        : null,
    };
  }

  private normalizePromotionInput(dto: UpsertAdminPromotionDto) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    const discountValue = Number(dto.discountValue);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    if (startsAt && Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException({ error: 'PROMOTION_START_INVALID', message: 'La date de début est invalide.' });
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException({ error: 'PROMOTION_END_INVALID', message: 'La date de fin est invalide.' });
    }

    if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
      throw new BadRequestException({ error: 'PROMOTION_DATE_RANGE_INVALID', message: 'La date de fin doit être après la date de début.' });
    }

    if (dto.discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
      throw new BadRequestException({
        error: 'PROMOTION_PERCENTAGE_INVALID',
        message: 'Une remise en pourcentage doit être comprise entre 0.01 et 100.',
      });
    }

    if (dto.discountType === 'fixed_amount' && discountValue <= 0) {
      throw new BadRequestException({
        error: 'PROMOTION_FIXED_AMOUNT_INVALID',
        message: 'Une remise fixe doit être supérieure à 0.',
      });
    }

    if (dto.usageLimit && dto.perCustomerLimit && dto.perCustomerLimit > dto.usageLimit) {
      throw new BadRequestException({
        error: 'PROMOTION_LIMIT_INVALID',
        message: 'La limite par client ne peut pas dépasser la limite totale.',
      });
    }

    return {
      name,
      code,
      discountType: dto.discountType,
      discountValue: discountValue.toFixed(2),
      startsAt,
      endsAt,
      isActive: dto.isActive ?? true,
      usageLimit: dto.usageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? null,
    };
  }

  private async assertPromotionExists(restaurantId: string, promotionId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        id: promotionId,
        restaurantId,
      },
      select: { id: true },
    });

    if (!promotion) {
      throw new NotFoundException({ error: 'PROMOTION_NOT_FOUND', message: 'Code promo introuvable.' });
    }
  }

  private async getPromotionForCampaign(restaurantId: string, promotionId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        id: promotionId,
        restaurantId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
      },
    });

    if (!promotion) {
      throw new NotFoundException({ error: 'PROMOTION_NOT_FOUND', message: 'Code promo introuvable.' });
    }

    if (!promotion.isActive) {
      throw new BadRequestException({ error: 'PROMOTION_INACTIVE', message: 'Ce code promo est inactif.' });
    }

    if (promotion.endsAt && promotion.endsAt.getTime() < Date.now()) {
      throw new BadRequestException({ error: 'PROMOTION_EXPIRED', message: 'Ce code promo a expiré.' });
    }

    return promotion;
  }

  private handlePromotionWriteError(error: unknown): never {
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        error: 'PROMOTION_CODE_ALREADY_EXISTS',
        message: 'Ce code promo existe déjà pour ce restaurant.',
      });
    }

    throw error;
  }
}
