import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateStorefrontOrderDto } from './dto/create-storefront-order.dto';
import { PreviewStorefrontPromotionDto } from './dto/preview-storefront-promotion.dto';
import { DELIVERY_ZONE_RULES, normalizePostalCode } from './delivery-zones';

type OrderPromotionComputation = {
  promotionId: string;
  promotionCode: string;
  promotionName: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  private generateOrderNumber(prefix: string) {
    const suffix = Date.now().toString().slice(-6);
    return `${prefix}-${suffix}`;
  }

  private normalizeOrderItems(items: Array<{ id: string; name?: string; price: number; quantity: number; selectedOptions?: unknown[] }>) {
    return items.map((item) => ({
      menuItemId: item.id,
      name: item.name?.trim() || 'Article',
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      selectedOptions: this.normalizeSelectedOptions(item.selectedOptions),
    }));
  }

  private normalizeSelectedOptions(rawOptions: unknown): Array<{
    groupId: string | null;
    optionId: string | null;
    groupName: string;
    optionLabel: string;
    priceDelta: number;
  }> {
    if (!Array.isArray(rawOptions)) {
      return [];
    }

    return rawOptions
      .filter((row) => row && typeof row === 'object')
      .map((row) => {
        const option = row as Record<string, unknown>;
        return {
          groupId: typeof option.groupId === 'string' ? option.groupId.trim() : null,
          optionId: typeof option.optionId === 'string' ? option.optionId.trim() : null,
          groupName: typeof option.groupName === 'string' ? option.groupName.trim() : '',
          optionLabel: typeof option.optionLabel === 'string' ? option.optionLabel.trim() : '',
          priceDelta: Number.isFinite(Number(option.priceDelta)) ? Number(option.priceDelta) : 0,
        };
      })
      .filter((option) => option.groupName && option.optionLabel);
  }

  private recomputeOrderItemsFromMenuCatalog(
    orderingSettings: unknown,
    rawItems: Array<{ id: string; name?: string; price: number; quantity: number; selectedOptions?: unknown[] }>,
  ) {
    const normalizedItems = this.normalizeOrderItems(rawItems);
    const settings = (orderingSettings as Record<string, unknown> | null) || {};
    const menuCatalog = Array.isArray(settings.menuCatalog) ? settings.menuCatalog : [];
    const menuById = new Map(
      menuCatalog
        .filter((row) => row && typeof row === 'object')
        .map((row) => {
          const item = row as Record<string, unknown>;
          return [String(item.id || ''), item];
        }),
    );

    return normalizedItems.map((item) => {
      const menuItem = menuById.get(item.menuItemId);
      if (!menuItem) {
        return item;
      }

      const basePrice = Number.isFinite(Number(menuItem.price)) ? Number(menuItem.price) : Number(item.price || 0);
      const rawGroups = Array.isArray(menuItem.optionGroups) ? menuItem.optionGroups : [];
      const validSelectedOptions = item.selectedOptions
        .map((selected) => {
          const matchedGroup = rawGroups.find((group) => {
            if (!group || typeof group !== 'object') return false;
            const row = group as Record<string, unknown>;
            const groupId = typeof row.id === 'string' ? row.id.trim() : '';
            const groupName = typeof row.name === 'string' ? row.name.trim() : '';
            return (selected.groupId && groupId && selected.groupId === groupId)
              || (selected.groupName && groupName && selected.groupName === groupName);
          });
          if (!matchedGroup || typeof matchedGroup !== 'object') return null;
          const groupRow = matchedGroup as Record<string, unknown>;
          const rawOptions = Array.isArray(groupRow.options) ? groupRow.options : [];
          const matchedOption = rawOptions.find((option) => {
            if (!option || typeof option !== 'object') return false;
            const row = option as Record<string, unknown>;
            const optionId = typeof row.id === 'string' ? row.id.trim() : '';
            const optionLabel = typeof row.label === 'string' ? row.label.trim() : '';
            return (selected.optionId && optionId && selected.optionId === optionId)
              || (selected.optionLabel && optionLabel && selected.optionLabel === optionLabel);
          });
          if (!matchedOption || typeof matchedOption !== 'object') return null;
          const optionRow = matchedOption as Record<string, unknown>;
          return {
            groupId: typeof groupRow.id === 'string' ? groupRow.id.trim() : null,
            optionId: typeof optionRow.id === 'string' ? optionRow.id.trim() : null,
            groupName: typeof groupRow.name === 'string' ? groupRow.name.trim() : selected.groupName,
            optionLabel: typeof optionRow.label === 'string' ? optionRow.label.trim() : selected.optionLabel,
            priceDelta: Number.isFinite(Number(optionRow.priceDelta)) ? Number(optionRow.priceDelta) : 0,
          };
        })
        .filter(Boolean) as Array<{ groupId: string | null; optionId: string | null; groupName: string; optionLabel: string; priceDelta: number }>;

      const optionDeltaTotal = validSelectedOptions.reduce((sum, option) => sum + Number(option.priceDelta || 0), 0);
      return {
        ...item,
        price: basePrice + optionDeltaTotal,
        selectedOptions: validSelectedOptions,
      };
    });
  }

  private computeSubtotal(items: Array<{ price: number; quantity: number }>) {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  private resolveDeliveryRule(rawPostalCode?: string | null) {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!postalCode) return null;
    const rule = DELIVERY_ZONE_RULES[postalCode];
    if (!rule) return null;
    return { postalCode, ...rule };
  }

  async previewStorefrontPromotion(
    restaurantId: string,
    dto: PreviewStorefrontPromotionDto,
    identity?: { customerId?: string | null; customerEmail?: string | null },
  ) {
    const normalizedItems = this.normalizeOrderItems(dto.items);
    return this.resolvePromotionForOrder(
      restaurantId,
      dto.promotionCode,
      normalizedItems,
      {
        customerId: identity?.customerId || null,
        customerEmail: dto.customerEmail?.trim().toLowerCase() || identity?.customerEmail?.trim().toLowerCase() || null,
        customerPhone: dto.customerPhone?.trim() || null,
      },
    );
  }

  async createStorefrontOrder(
    restaurantId: string,
    dto: CreateStorefrontOrderDto,
    options?: { customerId?: string | null; customerEmail?: string | null },
  ) {
    const normalizedAddress = dto.customerAddress?.trim() || null;
    const normalizedPostalCode = normalizePostalCode(dto.customerPostalCode || normalizedAddress);
    const normalizedNotes = dto.notes?.trim() || null;

    if (dto.orderType === 'delivery' && !normalizedAddress) {
      throw new BadRequestException({
        error: 'DELIVERY_ADDRESS_REQUIRED',
        message: 'Delivery orders require a non-empty customer address.',
      });
    }

    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    const orderingSettings = (restaurant?.orderingSettings as Record<string, unknown> | null) || {};
    const prefix = typeof orderingSettings.orderNumberPrefix === 'string' ? orderingSettings.orderNumberPrefix : 'ORD';
    const orderNumber = this.generateOrderNumber(prefix);
    const normalizedItems = this.recomputeOrderItemsFromMenuCatalog(orderingSettings, dto.items);
    const normalizedCustomerEmail = dto.customerEmail?.trim().toLowerCase() || options?.customerEmail?.trim().toLowerCase() || null;
    const promotionResult = dto.promotionCode
      ? await this.resolvePromotionForOrder(restaurantId, dto.promotionCode, normalizedItems, {
          customerId: options?.customerId || null,
          customerEmail: normalizedCustomerEmail,
          customerPhone: dto.customerPhone?.trim() || null,
        })
      : null;

    const subtotalAmount = this.computeSubtotal(normalizedItems);
    const discountAmount = promotionResult?.discountAmount || 0;
    const discountedSubtotal = promotionResult?.totalAmount || subtotalAmount;
    let deliveryFeeAmount = 0;

    if (dto.orderType === 'delivery') {
      const deliveryRule = this.resolveDeliveryRule(normalizedPostalCode);
      if (!deliveryRule) {
        throw new BadRequestException({
          error: 'DELIVERY_POSTAL_CODE_UNSUPPORTED',
          message: 'Delivery is unavailable for this postal code.',
        });
      }

      if (subtotalAmount < deliveryRule.minimumOrder) {
        throw new BadRequestException({
          error: 'DELIVERY_MINIMUM_NOT_REACHED',
          message: `Minimum order is CHF ${deliveryRule.minimumOrder.toFixed(2)} for postal code ${deliveryRule.postalCode}.`,
        });
      }

      deliveryFeeAmount = deliveryRule.deliveryFee;
    }

    const totalAmount = Number((discountedSubtotal + deliveryFeeAmount).toFixed(2));

    const order = await this.prisma.$transaction(async (tx: any) => {
      if (promotionResult?.promotionId) {
        await tx.promotion.update({
          where: { id: promotionResult.promotionId },
          data: {
            usageCount: { increment: 1 },
          },
        });
      }

      return tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          customerName: dto.customerName,
          customerId: options?.customerId || null,
          customerEmail: normalizedCustomerEmail,
          promotionId: promotionResult?.promotionId || null,
          promotionCode: promotionResult?.promotionCode || null,
          status: 'new',
          subtotalAmount,
          discountAmount,
          totalAmount,
          payload: {
            customerPhone: dto.customerPhone,
            customerAddress: normalizedAddress,
            customerPostalCode: normalizedPostalCode || null,
            orderType: dto.orderType,
            paymentMethod: dto.paymentMethod,
            notes: normalizedNotes,
            items: normalizedItems,
            subtotalAmount,
            discountAmount,
            deliveryFeeAmount,
            totalAmount,
            promotion: promotionResult
              ? {
                  id: promotionResult.promotionId,
                  code: promotionResult.promotionCode,
                  name: promotionResult.promotionName,
                  discountType: promotionResult.discountType,
                  discountValue: promotionResult.discountValue,
                }
              : null,
          },
        },
      });
    });

    await this.notificationService.publish({
      type: 'order.status_changed',
      restaurantId,
      customerEmail: order.customerEmail,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        prepMinutes: order.prepMinutes,
        customerName: order.customerName,
        customerPhone: dto.customerPhone,
      },
    });

    return order;
  }

  private async resolvePromotionForOrder(
    restaurantId: string,
    promotionCode: string,
    items: Array<{ menuItemId: string; name: string; price: number; quantity: number }>,
    identity?: { customerId?: string | null; customerEmail?: string | null; customerPhone?: string | null },
  ): Promise<OrderPromotionComputation> {
    const normalizedCode = promotionCode.trim().toUpperCase();
    const subtotalAmount = this.computeSubtotal(items);

    if (!normalizedCode) {
      throw new BadRequestException({ error: 'PROMOTION_INVALID', message: 'Veuillez saisir un code promo valide.' });
    }

    if (subtotalAmount <= 0) {
      throw new BadRequestException({ error: 'PROMOTION_NOT_APPLICABLE', message: 'Ce code promo ne s’applique pas à ce panier.' });
    }

    const promotion = await this.prisma.promotion.findFirst({
      where: {
        restaurantId,
        code: normalizedCode,
      },
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
      },
    });

    if (!promotion) {
      throw new BadRequestException({ error: 'PROMOTION_INVALID', message: 'Code promo invalide.' });
    }

    const now = Date.now();
    if (!promotion.isActive) {
      throw new BadRequestException({ error: 'PROMOTION_INACTIVE', message: 'Ce code promo est inactif.' });
    }

    if (promotion.startsAt && promotion.startsAt.getTime() > now) {
      throw new BadRequestException({ error: 'PROMOTION_NOT_STARTED', message: 'Ce code promo n’est pas encore actif.' });
    }

    if (promotion.endsAt && promotion.endsAt.getTime() < now) {
      throw new BadRequestException({ error: 'PROMOTION_EXPIRED', message: 'Ce code promo a expiré.' });
    }

    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      throw new BadRequestException({ error: 'PROMOTION_USAGE_LIMIT_REACHED', message: 'Ce code promo n’est plus disponible.' });
    }

    if (promotion.perCustomerLimit) {
      const alreadyUsedCount = await this.countPromotionUsageForCustomer(restaurantId, promotion.id, identity);
      if (alreadyUsedCount >= promotion.perCustomerLimit) {
        throw new BadRequestException({ error: 'PROMOTION_ALREADY_USED', message: 'Ce code promo a déjà été utilisé.' });
      }
    }

    const promotionValue = Number(promotion.discountValue || 0);
    const rawDiscount = promotion.discountType === 'percentage'
      ? subtotalAmount * (promotionValue / 100)
      : promotionValue;
    const discountAmount = Math.min(Number(rawDiscount.toFixed(2)), Number(subtotalAmount.toFixed(2)));
    const totalAmount = Math.max(Number((subtotalAmount - discountAmount).toFixed(2)), 0);

    if (discountAmount <= 0) {
      throw new BadRequestException({ error: 'PROMOTION_NOT_APPLICABLE', message: 'Ce code promo ne s’applique pas à ce panier.' });
    }

    return {
      promotionId: promotion.id,
      promotionCode: promotion.code,
      promotionName: promotion.name,
      discountType: promotion.discountType,
      discountValue: promotionValue,
      subtotalAmount: Number(subtotalAmount.toFixed(2)),
      discountAmount,
      totalAmount,
    };
  }

  private async countPromotionUsageForCustomer(
    restaurantId: string,
    promotionId: string,
    identity?: { customerId?: string | null; customerEmail?: string | null; customerPhone?: string | null },
  ) {
    const normalizedCustomerId = identity?.customerId?.trim() || null;
    const normalizedEmail = identity?.customerEmail?.trim().toLowerCase() || null;
    const normalizedPhone = identity?.customerPhone?.trim() || null;

    if (!normalizedCustomerId && !normalizedEmail && !normalizedPhone) {
      return 0;
    }

    return this.prisma.order.count({
      where: {
        restaurantId,
        promotionId,
        OR: [
          ...(normalizedCustomerId ? [{ customerId: normalizedCustomerId }] : []),
          ...(normalizedEmail ? [{ customerEmail: normalizedEmail }] : []),
        ],
      },
    }).then(async (countByIdOrEmail: number) => {
      if (countByIdOrEmail > 0 || !normalizedPhone) {
        return countByIdOrEmail;
      }

      const phoneMatches = await this.prisma.order.findMany({
        where: {
          restaurantId,
          promotionId,
        },
        select: {
          payload: true,
        },
        take: 500,
      });

      return phoneMatches.filter((order: { payload: unknown }) => {
        const payload = order.payload && typeof order.payload === 'object' ? (order.payload as Record<string, unknown>) : {};
        return typeof payload.customerPhone === 'string' && payload.customerPhone.trim() === normalizedPhone;
      }).length;
    });
  }

  async getStorefrontOrderByNumber(restaurantId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        restaurantId,
        orderNumber,
      },
    });

    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    return order;
  }

  async listCustomerOrders(restaurantId: string, identity: { customerId?: string | null; customerEmail?: string | null }) {
    const customerId = identity.customerId?.trim() || null;
    const email = identity.customerEmail?.trim().toLowerCase() || null;
    if (!customerId && !email) return [];

    return this.prisma.order.findMany({
      where: {
        restaurantId,
        OR: [
          ...(customerId ? [{ customerId }] : []),
          ...(email ? [{ customerId: null, customerEmail: email }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }


  async listAdminOrders(restaurantId: string, options?: { includeHidden?: boolean }) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        ...(options?.includeHidden ? {} : { adminHiddenAt: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async hideAdminOrder(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found for this restaurant.' });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { adminHiddenAt: new Date() },
    });
  }

  async restoreAdminOrder(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found for this restaurant.' });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { adminHiddenAt: null },
    });
  }

  async listAdminReservations(restaurantId: string, options?: { includeHidden?: boolean }) {
    return this.prisma.reservation.findMany({
      where: {
        restaurantId,
        ...(options?.includeHidden ? {} : { adminHiddenAt: null }),
      },
      orderBy: [{ reservationDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async hideAdminReservation(restaurantId: string, reservationId: string) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
    if (!reservation) {
      throw new NotFoundException({ error: 'RESERVATION_NOT_FOUND', message: 'Reservation not found for this restaurant.' });
    }

    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { adminHiddenAt: new Date() },
    });
  }

  async restoreAdminReservation(restaurantId: string, reservationId: string) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
    if (!reservation) {
      throw new NotFoundException({ error: 'RESERVATION_NOT_FOUND', message: 'Reservation not found for this restaurant.' });
    }

    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { adminHiddenAt: null },
    });
  }

  async listOpenOrders(restaurantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { restaurantId, status: { in: ['new', 'accepted', 'ready'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const enriched = await Promise.all(
      orders.map(async (order: any) => {
        const payload = (order.payload && typeof order.payload === 'object' ? order.payload : {}) as Record<string, unknown>;
        const orderType = payload.orderType === 'delivery' ? 'delivery' : 'takeaway';

        const customerOrderCount = order.customerId
          ? await this.prisma.order.count({ where: { restaurantId, customerId: order.customerId } })
          : order.customerEmail
            ? await this.prisma.order.count({ where: { restaurantId, customerEmail: order.customerEmail } })
            : 0;

        return {
          ...order,
          orderType,
          customerPhone: typeof payload.customerPhone === 'string' ? payload.customerPhone : null,
          customerAddress: typeof payload.customerAddress === 'string' ? payload.customerAddress : null,
          paymentMethod: typeof payload.paymentMethod === 'string' ? payload.paymentMethod : null,
          notes: typeof payload.notes === 'string' ? payload.notes : null,
          customerTotalOrderCount: customerOrderCount,
          customerOrderCount: Math.max(customerOrderCount - 1, 0),
        };
      }),
    );

    return enriched;
  }

  async listOpenReservations(restaurantId: string) {
    return this.prisma.reservation.findMany({
      where: { restaurantId, status: { in: ['pending', 'confirmed'] } },
      orderBy: { reservationDate: 'asc' },
      take: 100,
    });
  }

  async updateStatus(
    restaurantId: string,
    orderId: string,
    status: 'accepted' | 'ready' | 'completed',
    prepMinutes?: 15 | 30 | 45 | 60,
  ) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found for this restaurant.' });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        prepMinutes: status === 'accepted' ? prepMinutes ?? order.prepMinutes : order.prepMinutes,
        payload: {
          ...(typeof order.payload === 'object' && order.payload ? (order.payload as Record<string, unknown>) : {}),
          customerFacingStatus: status,
          prepMinutes: status === 'accepted' ? prepMinutes ?? order.prepMinutes : order.prepMinutes,
          readyAt:
            status === 'accepted' && (prepMinutes ?? order.prepMinutes)
              ? new Date(Date.now() + (prepMinutes ?? order.prepMinutes)! * 60 * 1000).toISOString()
              : status === 'ready'
                ? new Date().toISOString()
                : null,
          statusUpdatedAt: new Date().toISOString(),
        },
      },
    });

    await this.notificationService.publish({
      type: 'order.status_changed',
      restaurantId,
      customerEmail: order.customerEmail,
      payload: {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        prepMinutes: updated.prepMinutes,
      },
    });

    return updated;
  }

  async updateReservationStatus(
    restaurantId: string,
    reservationId: string,
    status: 'confirmed' | 'cancelled',
  ) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id: reservationId, restaurantId } });
    if (!reservation) {
      throw new NotFoundException({ error: 'RESERVATION_NOT_FOUND', message: 'Reservation not found for this restaurant.' });
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status, statusUpdatedAt: new Date() },
    });

    await this.notificationService.publish({
      type: 'reservation.status_changed',
      restaurantId,
      customerEmail: reservation.customerEmail,
      payload: {
        reservationId: updated.id,
        customerName: updated.customerName,
        status: updated.status,
        reservationDate: updated.reservationDate.toISOString(),
      },
    });

    return updated;
  }

  async getDailyKpis(restaurantId: string) {

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [orders, reservations, turnoverAgg, visitorCount] = await Promise.all([
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
          status: { in: ['accepted', 'ready', 'completed'] },
        },
      }),
      this.prisma.storefrontVisit.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
        },
      }),
    ]);

    return {
      date: start.toISOString().slice(0, 10),
      dailyTurnover: Number(turnoverAgg._sum.totalAmount || 0),
      orderCount: orders,
      reservationCount: reservations,
      visitorCount,
    };
  }
}
