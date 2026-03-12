import { Injectable, Logger } from '@nestjs/common';

export type NotificationEventType =
  | 'order.status_changed'
  | 'reservation.status_changed';

export interface MarketingBulkEmailCommand {
  restaurantId: string;
  subject: string;
  body: string;
  recipientEmails: string[];
}

export interface MarketingBulkEmailResult {
  provider: string;
  dispatchedCount: number;
  status: 'disabled' | 'queued';
  note: string;
}

export interface NotificationEvent {
  type: NotificationEventType;
  restaurantId: string;
  customerEmail?: string | null;
  payload: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  private getProvider(): 'none' | 'resend' | 'unsupported' {
    const provider = (process.env.EMAIL_PROVIDER || 'none').toLowerCase();
    if (provider === 'none' || provider === 'resend') return provider;
    return 'unsupported';
  }

  private getResendApiKey(): string | null {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      this.logger.error('EMAIL_PROVIDER=resend but RESEND_API_KEY is missing.');
      return null;
    }
    return apiKey;
  }

  private getFromAddress(): string | null {
    const from = process.env.EMAIL_FROM?.trim();
    if (!from) {
      this.logger.error('EMAIL_PROVIDER=resend but EMAIL_FROM is missing.');
      return null;
    }
    return from;
  }

  private normalizeUniqueEmails(emails: string[]) {
    return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter((email) => /.+@.+\..+/.test(email)))];
  }

  private async sendViaResend(params: {
    apiKey: string;
    from: string;
    to: string;
    subject: string;
    text: string;
  }) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    });

    if (response.ok) return { ok: true as const, error: null };

    const responseText = await response.text();
    return {
      ok: false as const,
      error: `status=${response.status} body=${responseText.slice(0, 500)}`,
    };
  }

  async sendMarketingBulkEmail(command: MarketingBulkEmailCommand): Promise<MarketingBulkEmailResult> {
    const provider = this.getProvider();

    if (provider === 'none') {
      this.logger.warn(
        `Marketing email disabled (EMAIL_PROVIDER=none). restaurantId=${command.restaurantId} recipients=${command.recipientEmails.length}`,
      );
      return {
        provider,
        dispatchedCount: 0,
        status: 'disabled',
        note: 'EMAIL_PROVIDER=none',
      };
    }

    if (provider === 'unsupported') {
      const rawProvider = process.env.EMAIL_PROVIDER || 'undefined';
      this.logger.error(`Unsupported EMAIL_PROVIDER value for marketing bulk email: ${rawProvider}. Use EMAIL_PROVIDER=resend.`);
      return {
        provider: rawProvider,
        dispatchedCount: 0,
        status: 'disabled',
        note: `Unsupported EMAIL_PROVIDER=${rawProvider}`,
      };
    }

    const apiKey = this.getResendApiKey();
    const from = this.getFromAddress();
    if (!apiKey || !from) {
      return {
        provider,
        dispatchedCount: 0,
        status: 'disabled',
        note: 'resend_config_missing',
      };
    }

    const recipients = this.normalizeUniqueEmails(command.recipientEmails);
    let dispatchedCount = 0;

    for (const recipient of recipients) {
      const result = await this.sendViaResend({
        apiKey,
        from,
        to: recipient,
        subject: command.subject,
        text: command.body,
      });

      if (!result.ok) {
        this.logger.error(
          `Resend marketing email failed. restaurantId=${command.restaurantId} recipient=${recipient} ${result.error}`,
        );
        continue;
      }

      dispatchedCount += 1;
    }

    this.logger.log(
      `Resend marketing email send completed. restaurantId=${command.restaurantId} attempted=${recipients.length} sent=${dispatchedCount}`,
    );

    return {
      provider,
      dispatchedCount,
      status: 'queued',
      note: 'dispatched_via_resend',
    };
  }

  private buildEventEmail(event: NotificationEvent): { subject: string; text: string } {
    if (event.type === 'order.status_changed') {
      const orderNumber = String(event.payload.orderNumber || event.payload.orderId || '');
      const status = String(event.payload.status || 'updated');
      return {
        subject: orderNumber ? `Order ${orderNumber} update` : 'Order update',
        text: `Your order status is now: ${status}.`,
      };
    }

    const reservationDate = typeof event.payload.reservationDate === 'string' ? event.payload.reservationDate : '';
    const status = String(event.payload.status || 'updated');
    return {
      subject: 'Reservation update',
      text: reservationDate
        ? `Your reservation (${reservationDate}) status is now: ${status}.`
        : `Your reservation status is now: ${status}.`,
    };
  }

  async publish(event: NotificationEvent): Promise<void> {
    const provider = this.getProvider();

    if (provider === 'none') {
      this.logger.warn(
        `Email provider disabled; notification boundary only. type=${event.type} restaurantId=${event.restaurantId}`,
      );
      return;
    }

    if (provider === 'unsupported') {
      this.logger.error(`Unsupported EMAIL_PROVIDER value: ${process.env.EMAIL_PROVIDER || 'undefined'}. Use EMAIL_PROVIDER=resend.`);
      return;
    }

    const recipient = event.customerEmail?.trim().toLowerCase();
    if (!recipient || !/.+@.+\..+/.test(recipient)) {
      this.logger.warn(
        `Skipping transactional email with missing/invalid target. type=${event.type} restaurantId=${event.restaurantId}`,
      );
      return;
    }

    const apiKey = this.getResendApiKey();
    const from = this.getFromAddress();
    if (!apiKey || !from) return;

    const message = this.buildEventEmail(event);
    const result = await this.sendViaResend({
      apiKey,
      from,
      to: recipient,
      subject: message.subject,
      text: message.text,
    });

    if (!result.ok) {
      this.logger.error(
        `Resend transactional email failed. type=${event.type} restaurantId=${event.restaurantId} recipient=${recipient} ${result.error}`,
      );
      return;
    }

    this.logger.log(
      `Resend transactional email sent. type=${event.type} restaurantId=${event.restaurantId} recipient=${recipient}`,
    );
  }
}
