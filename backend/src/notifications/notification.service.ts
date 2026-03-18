import { Injectable, Logger } from '@nestjs/common';
import { Socket, connect as connectNet } from 'node:net';
import { TLSSocket, connect as connectTls } from 'node:tls';

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

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
}

interface SmtpResponse {
  code: number;
  lines: string[];
}

interface SmtpClient {
  socket: Socket | TLSSocket;
  readResponse: () => Promise<SmtpResponse>;
  writeLine: (line: string) => Promise<void>;
  close: () => void;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  private getMarketingProvider(): 'none' | 'resend' | 'unsupported' {
    const provider = (
      process.env.MARKETING_EMAIL_PROVIDER ||
      process.env.EMAIL_PROVIDER ||
      'none'
    )
      .trim()
      .toLowerCase();

    if (provider === 'none' || provider === 'resend') return provider;
    return 'unsupported';
  }

  private getTransactionalProvider(): 'none' | 'smtp' | 'unsupported' {
    const provider = (process.env.TRANSACTIONAL_EMAIL_PROVIDER || 'none').trim().toLowerCase();
    if (provider === 'none' || provider === 'smtp') return provider;
    return 'unsupported';
  }

  private getResendApiKey(purpose: 'marketing'): string | null {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      this.logger.error(`Missing RESEND_API_KEY for ${purpose} email delivery.`);
      return null;
    }
    return apiKey;
  }

  private getMarketingFromAddress(): string | null {
    const from = process.env.MARKETING_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim();
    if (!from) {
      this.logger.error('Missing MARKETING_EMAIL_FROM (or fallback EMAIL_FROM) for marketing email delivery.');
      return null;
    }
    return from;
  }

  private parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }

  private getSmtpConfig(): SmtpConfig | null {
    const host = process.env.SMTP_HOST?.trim();
    const portRaw = process.env.SMTP_PORT?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim();
    const replyTo = process.env.SMTP_REPLY_TO?.trim() || undefined;
    const secure = this.parseBooleanEnv(process.env.SMTP_SECURE, false);
    const port = Number(portRaw);

    const missing: string[] = [];
    if (!host) missing.push('SMTP_HOST');
    if (!portRaw || !Number.isFinite(port) || port <= 0) missing.push('SMTP_PORT');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    if (!from) missing.push('SMTP_FROM');

    if (missing.length > 0) {
      this.logger.error(`Incomplete SMTP configuration for transactional email delivery: missing ${missing.join(', ')}.`);
      return null;
    }

    return {
      host: host!,
      port,
      secure,
      user: user!,
      pass: pass!,
      from: from!,
      replyTo,
    };
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

  private createSmtpClient(socket: Socket | TLSSocket): SmtpClient {
    socket.setEncoding('utf8');
    socket.setTimeout(15000);

    let buffer = '';
    let currentLines: string[] = [];
    const responseQueue: SmtpResponse[] = [];
    const waiters: Array<(response: SmtpResponse) => void> = [];

    const enqueue = (response: SmtpResponse) => {
      const waiter = waiters.shift();
      if (waiter) {
        waiter(response);
        return;
      }
      responseQueue.push(response);
    };

    socket.on('data', (chunk: string | Buffer) => {
      buffer += chunk.toString();

      let separatorIndex = buffer.indexOf('\r\n');
      while (separatorIndex >= 0) {
        const line = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        if (line) {
          currentLines.push(line);
          if (/^\d{3} /.test(line)) {
            enqueue({
              code: Number(line.slice(0, 3)),
              lines: currentLines,
            });
            currentLines = [];
          }
        }

        separatorIndex = buffer.indexOf('\r\n');
      }
    });

    return {
      socket,
      readResponse: async () => {
        if (responseQueue.length > 0) {
          return responseQueue.shift()!;
        }

        return new Promise<SmtpResponse>((resolve, reject) => {
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const onTimeout = () => {
            cleanup();
            reject(new Error('SMTP socket timeout'));
          };
          const onClose = () => {
            cleanup();
            reject(new Error('SMTP socket closed unexpectedly'));
          };
          const cleanup = () => {
            socket.off('error', onError);
            socket.off('timeout', onTimeout);
            socket.off('close', onClose);
          };

          socket.once('error', onError);
          socket.once('timeout', onTimeout);
          socket.once('close', onClose);
          waiters.push((response) => {
            cleanup();
            resolve(response);
          });
        });
      },
      writeLine: async (line: string) =>
        new Promise<void>((resolve, reject) => {
          socket.write(`${line}\r\n`, (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
      close: () => {
        socket.end();
        socket.destroy();
      },
    };
  }

  private async connectSmtpClient(config: SmtpConfig): Promise<SmtpClient> {
    const socket = config.secure
      ? connectTls({
          host: config.host,
          port: config.port,
          servername: config.host,
        })
      : connectNet({
          host: config.host,
          port: config.port,
        });

    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error('SMTP connection timeout'));
      };
      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('secureConnect', onConnect);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };

      socket.setTimeout(15000);
      if (config.secure) {
        socket.once('secureConnect', onConnect);
      } else {
        socket.once('connect', onConnect);
      }
      socket.once('error', onError);
      socket.once('timeout', onTimeout);
    });

    return this.createSmtpClient(socket);
  }

  private async upgradeSmtpClientToTls(client: SmtpClient, config: SmtpConfig): Promise<SmtpClient> {
    const upgradedSocket = await new Promise<TLSSocket>((resolve, reject) => {
      const tlsSocket = connectTls({
        socket: client.socket,
        servername: config.host,
      });

      const onSecure = () => {
        cleanup();
        resolve(tlsSocket);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error('SMTP STARTTLS timeout'));
      };
      const cleanup = () => {
        tlsSocket.off('secureConnect', onSecure);
        tlsSocket.off('error', onError);
        tlsSocket.off('timeout', onTimeout);
      };

      tlsSocket.setTimeout(15000);
      tlsSocket.once('secureConnect', onSecure);
      tlsSocket.once('error', onError);
      tlsSocket.once('timeout', onTimeout);
    });

    return this.createSmtpClient(upgradedSocket);
  }

  private async expectSmtpResponse(
    client: SmtpClient,
    expectedCodes: number[],
    context: string,
  ): Promise<SmtpResponse> {
    const response = await client.readResponse();
    if (!expectedCodes.includes(response.code)) {
      throw new Error(`${context} failed: ${response.lines.join(' | ')}`);
    }
    return response;
  }

  private escapeSmtpData(value: string): string {
    return value
      .replace(/\r?\n/g, '\r\n')
      .split('\r\n')
      .map((line) => (line.startsWith('.') ? `.${line}` : line))
      .join('\r\n');
  }

  private async sendViaSmtp(params: {
    config: SmtpConfig;
    to: string;
    subject: string;
    text: string;
  }) {
    let client: SmtpClient | null = null;

    try {
      client = await this.connectSmtpClient(params.config);
      await this.expectSmtpResponse(client, [220], 'SMTP greeting');

      await client.writeLine(`EHLO ${params.config.host}`);
      let ehloResponse = await this.expectSmtpResponse(client, [250], 'SMTP EHLO');

      const supportsStartTls = ehloResponse.lines.some((line) => line.toUpperCase().includes('STARTTLS'));
      if (!params.config.secure && supportsStartTls) {
        await client.writeLine('STARTTLS');
        await this.expectSmtpResponse(client, [220], 'SMTP STARTTLS');
        client = await this.upgradeSmtpClientToTls(client, params.config);
        await client.writeLine(`EHLO ${params.config.host}`);
        ehloResponse = await this.expectSmtpResponse(client, [250], 'SMTP EHLO after STARTTLS');
      }

      const supportsAuthLogin = ehloResponse.lines.some((line) => line.toUpperCase().includes('AUTH') && line.toUpperCase().includes('LOGIN'));
      if (!supportsAuthLogin) {
        throw new Error(`SMTP AUTH LOGIN not supported: ${ehloResponse.lines.join(' | ')}`);
      }

      await client.writeLine('AUTH LOGIN');
      await this.expectSmtpResponse(client, [334], 'SMTP AUTH LOGIN');
      await client.writeLine(Buffer.from(params.config.user, 'utf8').toString('base64'));
      await this.expectSmtpResponse(client, [334], 'SMTP username');
      await client.writeLine(Buffer.from(params.config.pass, 'utf8').toString('base64'));
      await this.expectSmtpResponse(client, [235], 'SMTP password');

      await client.writeLine(`MAIL FROM:<${params.config.from}>`);
      await this.expectSmtpResponse(client, [250], 'SMTP MAIL FROM');

      await client.writeLine(`RCPT TO:<${params.to}>`);
      await this.expectSmtpResponse(client, [250, 251], 'SMTP RCPT TO');

      await client.writeLine('DATA');
      await this.expectSmtpResponse(client, [354], 'SMTP DATA');

      const headers = [
        `From: ${params.config.from}`,
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        ...(params.config.replyTo ? [`Reply-To: ${params.config.replyTo}`] : []),
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
      ];

      const data = `${headers.join('\r\n')}\r\n\r\n${this.escapeSmtpData(params.text)}\r\n.`;
      await client.writeLine(data);
      await this.expectSmtpResponse(client, [250], 'SMTP message body');

      await client.writeLine('QUIT');
      await this.expectSmtpResponse(client, [221], 'SMTP QUIT');
      client.close();
      return { ok: true as const, error: null };
    } catch (error) {
      if (client) {
        client.close();
      }
      const message = error instanceof Error ? error.message : 'unknown_smtp_error';
      return {
        ok: false as const,
        error: message,
      };
    }
  }

  async sendMarketingBulkEmail(command: MarketingBulkEmailCommand): Promise<MarketingBulkEmailResult> {
    const provider = this.getMarketingProvider();

    if (provider === 'none') {
      this.logger.warn(
        `Marketing email disabled (MARKETING_EMAIL_PROVIDER=none). restaurantId=${command.restaurantId} recipients=${command.recipientEmails.length}`,
      );
      return {
        provider,
        dispatchedCount: 0,
        status: 'disabled',
        note: 'MARKETING_EMAIL_PROVIDER=none',
      };
    }

    if (provider === 'unsupported') {
      const rawProvider = process.env.MARKETING_EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || 'undefined';
      this.logger.error(`Unsupported marketing email provider: ${rawProvider}. Use MARKETING_EMAIL_PROVIDER=resend.`);
      return {
        provider: rawProvider,
        dispatchedCount: 0,
        status: 'disabled',
        note: `Unsupported MARKETING_EMAIL_PROVIDER=${rawProvider}`,
      };
    }

    const apiKey = this.getResendApiKey('marketing');
    const from = this.getMarketingFromAddress();
    if (!apiKey || !from) {
      return {
        provider,
        dispatchedCount: 0,
        status: 'disabled',
        note: 'marketing_resend_config_missing',
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
    const provider = this.getTransactionalProvider();

    if (provider === 'none') {
      this.logger.warn(
        `Transactional email disabled; notification boundary only. type=${event.type} restaurantId=${event.restaurantId}`,
      );
      return;
    }

    if (provider === 'unsupported') {
      this.logger.error(
        `Unsupported TRANSACTIONAL_EMAIL_PROVIDER value: ${process.env.TRANSACTIONAL_EMAIL_PROVIDER || 'undefined'}. Use TRANSACTIONAL_EMAIL_PROVIDER=smtp.`,
      );
      return;
    }

    const recipient = event.customerEmail?.trim().toLowerCase();
    if (!recipient || !/.+@.+\..+/.test(recipient)) {
      this.logger.warn(
        `Skipping transactional email with missing/invalid target. type=${event.type} restaurantId=${event.restaurantId}`,
      );
      return;
    }

    const smtpConfig = this.getSmtpConfig();
    if (!smtpConfig) return;

    const message = this.buildEventEmail(event);
    const result = await this.sendViaSmtp({
      config: smtpConfig,
      to: recipient,
      subject: message.subject,
      text: message.text,
    });

    if (!result.ok) {
      this.logger.error(
        `SMTP transactional email failed. type=${event.type} restaurantId=${event.restaurantId} recipient=${recipient} error=${result.error}`,
      );
      return;
    }

    this.logger.log(
      `SMTP transactional email sent. type=${event.type} restaurantId=${event.restaurantId} recipient=${recipient}`,
    );
  }
}
