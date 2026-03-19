import { Injectable } from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { SendAdminMarketingEmailDto } from './dto/send-admin-marketing-email.dto';

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
        subscribedEmail: subscribed,
      },
    });
  }

  async sendBulkEmail(restaurantId: string, dto: SendAdminMarketingEmailDto) {
    const excludedCustomerIds = Array.from(new Set((dto.excludedCustomerIds || []).filter(Boolean)));
    const subscribedTotal = await this.prisma.customer.count({
      where: {
        restaurantId,
        subscribedEmail: true,
      },
    });

    const recipients = await this.prisma.customer.findMany({
      where: {
        restaurantId,
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
    };
  }
}
