import { Injectable, Logger } from '@nestjs/common';

export type NotificationEventType =
  | 'order.status_changed'
  | 'reservation.status_changed';

export interface NotificationEvent {
  type: NotificationEventType;
  restaurantId: string;
  customerEmail?: string | null;
  payload: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async publish(event: NotificationEvent): Promise<void> {
    const provider = (process.env.EMAIL_PROVIDER || 'none').toLowerCase();

    if (provider === 'none') {
      this.logger.warn(
        `Email provider not configured; notification boundary only. type=${event.type} restaurantId=${event.restaurantId}`,
      );
      return;
    }

    if (provider === 'webhook') {
      const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
      if (!webhookUrl) {
        this.logger.error('EMAIL_PROVIDER=webhook but EMAIL_WEBHOOK_URL is missing.');
        return;
      }

      // Integration boundary only (real provider call to be wired with retry/queue semantics).
      this.logger.log(`Email notification queued for external webhook provider. type=${event.type} target=${event.customerEmail || 'n/a'} url=${webhookUrl}`);
      return;
    }

    this.logger.error(`Unsupported EMAIL_PROVIDER value: ${provider}`);
  }
}