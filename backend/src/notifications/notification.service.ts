import { Injectable, Logger } from '@nestjs/common';
import { Socket, connect as connectNet } from 'node:net';
import { TLSSocket, connect as connectTls } from 'node:tls';
import { PrismaService } from '../prisma/prisma.service';

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

interface RestaurantEmailContext {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  logoUrl: string | null;
  logoSourcePath: string | null;
  primaryColor: string;
  accentColor: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
}

interface TransactionalEmailMessage {
  subject: string;
  text: string;
  html: string;
  debug: {
    logoUrl: string | null;
    logoSourcePath: string | null;
  };
}

interface MarketingEmailMessage {
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    html?: string;
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
        ...(params.html ? { html: params.html } : {}),
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
    html?: string;
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

      const boundary = `boundary_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      const headers = [
        `From: ${params.config.from}`,
        `To: ${params.to}`,
        `Subject: ${params.subject}`,
        ...(params.config.replyTo ? [`Reply-To: ${params.config.replyTo}`] : []),
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        ...(params.html
          ? [`Content-Type: multipart/alternative; boundary="${boundary}"`]
          : ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit']),
      ];

      const body = params.html
        ? [
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            this.escapeSmtpData(params.text),
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            this.escapeSmtpData(params.html),
            '',
            `--${boundary}--`,
          ].join('\r\n')
        : this.escapeSmtpData(params.text);

      const data = `${headers.join('\r\n')}\r\n\r\n${body}\r\n.`;
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
    const marketingMessage = await this.buildMarketingEmail(command);
    let dispatchedCount = 0;

    for (const recipient of recipients) {
      const result = await this.sendViaResend({
        apiKey,
        from,
        to: recipient,
        subject: marketingMessage.subject,
        text: marketingMessage.text,
        html: marketingMessage.html,
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

  private async buildMarketingEmail(command: MarketingBulkEmailCommand): Promise<MarketingEmailMessage> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: command.restaurantId },
      select: {
        id: true,
        name: true,
        branding: true,
        contactInfo: true,
        timezone: true,
        locale: true,
        currency: true,
      },
    });

    const context = this.getRestaurantEmailContext(
      restaurant || {
        id: command.restaurantId,
        name: 'Notre restaurant',
        branding: null,
        contactInfo: null,
        timezone: 'Europe/Zurich',
        locale: 'fr-CH',
        currency: 'CHF',
      },
    );

    const intro = 'Nous sommes heureux de partager cette communication avec vous.';
    const bodyLines = command.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1].length > 0));
    const bodyHtml = bodyLines
      .map((line) => (line.length > 0 ? `<p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.85;">${this.escapeHtml(line)}</p>` : '<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>'))
      .join('');

    const contactBits = [context.contactPhone, context.contactEmail, context.contactAddress].filter(Boolean);
    const textLines = [
      context.name,
      '',
      command.subject,
      '',
      command.body.trim(),
      '',
      ...(contactBits.length > 0 ? ['Contact :', contactBits.map((value) => String(value)).join(' · ')] : []),
    ];

    return {
      subject: command.subject,
      text: textLines.join('\n'),
      html: `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.escapeHtml(command.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${this.escapeHtml(command.subject)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#111111;height:8px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:34px 36px 28px;text-align:center;border-bottom:1px solid #e5e7eb;">
                ${
                  context.logoUrl
                    ? `<div style="margin:0 auto 18px;display:inline-block;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:16px 22px;">
                        <img src="${this.escapeHtml(context.logoUrl)}" alt="${this.escapeHtml(context.name)} logo" width="180" style="max-width:180px;max-height:88px;width:auto;height:auto;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                      </div>`
                    : ''
                }
                <div style="color:#111111;font-size:14px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;">${this.escapeHtml(context.name)}</div>
                <h1 style="margin:18px 0 10px;font-size:34px;line-height:1.18;color:#111111;">${this.escapeHtml(command.subject)}</h1>
                <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.8;">${this.escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 36px 20px;">
                <div style="padding:28px 28px 10px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 8px 30px rgba(17,17,17,0.04);">
                  ${bodyHtml || '<p style="margin:0;color:#374151;font-size:15px;line-height:1.85;">Merci pour votre attention.</p>'}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 34px;">
                <div style="padding:18px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">À bientôt</div>
                  <div style="font-size:15px;line-height:1.8;color:#374151;">Nous espérons avoir le plaisir de vous accueillir prochainement chez ${this.escapeHtml(context.name)}.</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px;background:#111111;text-align:center;">
                <div style="color:#ffffff;font-size:15px;font-weight:700;margin-bottom:6px;">${this.escapeHtml(context.name)}</div>
                ${
                  contactBits.length > 0
                    ? `<div style="color:#d1d5db;font-size:13px;line-height:1.8;">${contactBits
                        .map((value) => this.escapeHtml(String(value)))
                        .join(' · ')}</div>`
                    : '<div style="color:#d1d5db;font-size:13px;line-height:1.8;">Merci de votre fidélité.</div>'
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    };
  }

  private sanitizeRestaurantDisplayName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return 'Our restaurant';

    const sanitized = trimmed
      .replace(/\s*\(\s*local\s*\)\s*$/i, '')
      .replace(/\s*-\s*local\s*$/i, '')
      .replace(/\s+local\s*$/i, '');

    return sanitized.trim() || trimmed;
  }

  private getEmailBrandLogo(): { url: string | null; sourcePath: string | null } {
    const logoUrl = process.env.EMAIL_BRAND_LOGO_URL?.trim();
    if (!logoUrl) {
      return { url: null, sourcePath: null };
    }

    return {
      url: logoUrl,
      sourcePath: 'process.env.EMAIL_BRAND_LOGO_URL',
    };
  }

  private extractLogoUrlCandidate(
    value: unknown,
    sourcePath: string,
  ): { url: string; sourcePath: string } | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return {
        url: value.trim(),
        sourcePath,
      };
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const nested = this.extractLogoUrlCandidate(value[index], `${sourcePath}[${index}]`);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const nestedCandidates: Array<{ sourcePath: string; value: unknown }> = [
      { sourcePath: `${sourcePath}.url`, value: record.url },
      { sourcePath: `${sourcePath}.src`, value: record.src },
      { sourcePath: `${sourcePath}.href`, value: record.href },
      { sourcePath: `${sourcePath}.downloadUrl`, value: record.downloadUrl },
      { sourcePath: `${sourcePath}.downloadURL`, value: record.downloadURL },
      { sourcePath: `${sourcePath}.publicUrl`, value: record.publicUrl },
      { sourcePath: `${sourcePath}.publicURL`, value: record.publicURL },
      { sourcePath: `${sourcePath}.secureUrl`, value: record.secureUrl },
      { sourcePath: `${sourcePath}.secureURL`, value: record.secureURL },
      { sourcePath: `${sourcePath}.file`, value: record.file },
      { sourcePath: `${sourcePath}.asset`, value: record.asset },
      { sourcePath: `${sourcePath}.image`, value: record.image },
    ];

    for (const candidate of nestedCandidates) {
      const nested = this.extractLogoUrlCandidate(candidate.value, candidate.sourcePath);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  private resolveBrandingLogo(branding: Record<string, unknown>): { url: string | null; sourcePath: string | null } {
    const candidates: Array<{ sourcePath: string; value: unknown }> = [
      { sourcePath: 'branding.logoUrl', value: branding.logoUrl },
      { sourcePath: 'branding.logo_url', value: branding.logo_url },
      { sourcePath: 'branding.logo', value: branding.logo },
    ];

    for (const candidate of candidates) {
      const match = this.extractLogoUrlCandidate(candidate.value, candidate.sourcePath);
      if (match) {
        return match;
      }
    }

    return { url: null, sourcePath: null };
  }

  private getRestaurantEmailContext(restaurant: {
    id: string;
    name: string;
    timezone: string;
    locale: string;
    currency: string;
    branding: unknown;
    contactInfo: unknown;
  }): RestaurantEmailContext {
    const contactInfo = (restaurant.contactInfo as Record<string, unknown> | null) || {};
    const emailBrandLogo = this.getEmailBrandLogo();
    const addressCandidate = [
      contactInfo.address,
      [contactInfo.addressLine1, contactInfo.postalCode, contactInfo.city].filter((value) => typeof value === 'string' && value.trim()).join(' '),
    ].find((value) => typeof value === 'string' && value.trim().length > 0);

    return {
      id: restaurant.id,
      name: this.sanitizeRestaurantDisplayName(restaurant.name),
      timezone: restaurant.timezone || 'Europe/Zurich',
      locale: 'fr-CH',
      currency: restaurant.currency || 'CHF',
      logoUrl: emailBrandLogo.url,
      logoSourcePath: emailBrandLogo.sourcePath,
      primaryColor: '#111111',
      accentColor: '#111111',
      contactPhone: typeof contactInfo.phone === 'string' ? contactInfo.phone.trim() : null,
      contactEmail: typeof contactInfo.email === 'string' ? contactInfo.email.trim() : null,
      contactAddress: typeof addressCandidate === 'string' ? addressCandidate.trim() : null,
    };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private extractFirstImageSrc(html: string): string | null {
    const match = html.match(/<img[^>]+src="([^"]+)"/i);
    return match?.[1] || null;
  }

  private formatDateTime(value: string | Date | null | undefined, context: RestaurantEmailContext): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat(context.locale || 'fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: context.timezone || 'Europe/Zurich',
    }).format(date);
  }

  private formatCurrency(value: unknown, context: RestaurantEmailContext): string | null {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount)) return null;
    return new Intl.NumberFormat(context.locale || 'fr-CH', {
      style: 'currency',
      currency: context.currency || 'CHF',
    }).format(amount);
  }

  private formatOrderType(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'delivery') return 'Livraison';
    if (normalized === 'takeaway') return 'À emporter';
    if (normalized === 'pickup') return 'À emporter';
    if (normalized === 'dine_in') return 'Sur place';
    return normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private getOrderStatusContent(status: string) {
    switch (status) {
      case 'new':
        return {
          subjectLabel: 'Commande reçue',
          title: 'Nous avons bien reçu votre commande',
          intro: 'Merci pour votre commande. Notre équipe l’a bien reçue et va la préparer dans les meilleurs délais.',
          badgeLabel: 'Commande reçue',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      case 'accepted':
        return {
          subjectLabel: 'Commande en préparation',
          title: 'Votre commande est en préparation',
          intro: 'Bonne nouvelle : votre commande a été acceptée et elle est actuellement en préparation.',
          badgeLabel: 'En préparation',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      case 'ready':
        return {
          subjectLabel: 'Commande prête',
          title: 'Votre commande est prête',
          intro: 'Votre commande est maintenant prête. Si vous avez choisi le retrait sur place, vous pouvez venir la récupérer.',
          badgeLabel: 'Prête',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      case 'completed':
        return {
          subjectLabel: 'Commande terminée',
          title: 'Merci pour votre commande',
          intro: 'Votre commande a bien été finalisée. Nous espérons qu’elle vous plaira et serons ravis de vous accueillir à nouveau.',
          badgeLabel: 'Terminée',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      case 'cancelled':
        return {
          subjectLabel: 'Mise à jour de commande',
          title: 'Mise à jour concernant votre commande',
          intro: 'Votre commande a fait l’objet d’une mise à jour. N’hésitez pas à contacter le restaurant si vous avez besoin d’aide.',
          badgeLabel: 'Annulée',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      default:
        return {
          subjectLabel: 'Mise à jour de commande',
          title: 'Mise à jour concernant votre commande',
          intro: 'Une mise à jour a été apportée à votre commande.',
          badgeLabel: 'Mise à jour',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
    }
  }

  private getReservationStatusContent(status: string) {
    switch (status) {
      case 'pending':
        return {
          subjectLabel: 'Demande de réservation reçue',
          title: 'Nous avons bien reçu votre demande de réservation',
          intro: 'Merci pour votre demande de réservation. Notre équipe va vérifier les disponibilités et vous confirmera cela au plus vite.',
          badgeLabel: 'En attente de confirmation',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      case 'confirmed':
        return {
          subjectLabel: 'Réservation confirmée',
          title: 'Votre réservation est confirmée',
          intro: 'Excellente nouvelle : votre table est confirmée. Nous nous réjouissons de vous accueillir.',
          badgeLabel: 'Confirmée',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      case 'cancelled':
        return {
          subjectLabel: 'Mise à jour de réservation',
          title: 'Mise à jour concernant votre réservation',
          intro: 'Votre réservation a fait l’objet d’une mise à jour. Contactez le restaurant si vous souhaitez convenir d’un autre moment.',
          badgeLabel: 'Annulée',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
      default:
        return {
          subjectLabel: 'Mise à jour de réservation',
          title: 'Mise à jour concernant votre réservation',
          intro: 'Une mise à jour a été apportée à votre réservation.',
          badgeLabel: 'Mise à jour',
          badgeBackground: '#f3f4f6',
          badgeColor: '#111111',
        };
    }
  }

  private buildEmailShell(params: {
    context: RestaurantEmailContext;
    preheader: string;
    title: string;
    intro: string;
    badgeLabel: string;
    badgeBackground: string;
    badgeColor: string;
    detailRows: Array<{ label: string; value: string }>;
    notes?: string | null;
    closing?: string | null;
  }): string {
    const detailRowsHtml = params.detailRows
      .map(
        (row) => `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:600;width:38%;">
              ${this.escapeHtml(row.label)}
            </td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;text-align:right;">
              ${this.escapeHtml(row.value)}
            </td>
          </tr>`,
      )
      .join('');

    const contactBits = [params.context.contactPhone, params.context.contactEmail, params.context.contactAddress].filter(Boolean);

    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.escapeHtml(params.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${this.escapeHtml(params.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:${this.escapeHtml(params.context.primaryColor)};height:6px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:28px 32px 24px;text-align:center;border-bottom:1px solid #e5e7eb;">
                ${
                  params.context.logoUrl
                    ? `<div style="margin:0 auto 18px;display:inline-block;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:16px 20px;">
                        <img src="${this.escapeHtml(params.context.logoUrl)}" alt="${this.escapeHtml(params.context.name)} logo" width="180" style="max-width:180px;max-height:88px;width:auto;height:auto;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                      </div>`
                    : ''
                }
                <div style="color:#111111;font-size:30px;font-weight:700;line-height:1.2;">${this.escapeHtml(params.context.name)}</div>
                <div style="margin-top:8px;color:#6b7280;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">Confirmation client</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <div style="display:inline-block;background:${this.escapeHtml(params.badgeBackground)};color:${this.escapeHtml(params.badgeColor)};padding:7px 12px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">
                  ${this.escapeHtml(params.badgeLabel)}
                </div>
                <h1 style="margin:18px 0 12px;font-size:30px;line-height:1.2;color:#111111;">${this.escapeHtml(params.title)}</h1>
                <p style="margin:0 0 26px;color:#4b5563;font-size:15px;line-height:1.8;">${this.escapeHtml(params.intro)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:16px;padding:0 20px;background:#ffffff;">
                  <tr>
                    <td style="padding:10px 22px 6px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${detailRowsHtml}
                      </table>
                    </td>
                  </tr>
                </table>
                ${
                  params.notes
                    ? `<div style="margin-top:22px;padding:18px 20px;background:#f9fafb;border-radius:14px;border:1px solid #e5e7eb;">
                        <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Notes</div>
                        <div style="font-size:14px;line-height:1.7;color:#374151;">${this.escapeHtml(params.notes)}</div>
                      </div>`
                    : ''
                }
                ${
                  params.closing
                    ? `<p style="margin:26px 0 0;color:#4b5563;font-size:14px;line-height:1.8;">${this.escapeHtml(params.closing)}</p>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px;background:#111111;border-top:1px solid #111111;text-align:center;">
                <div style="color:#ffffff;font-size:14px;font-weight:700;margin-bottom:6px;">${this.escapeHtml(params.context.name)}</div>
                ${
                  contactBits.length > 0
                    ? `<div style="color:#d1d5db;font-size:13px;line-height:1.7;">${contactBits
                        .map((value) => this.escapeHtml(String(value)))
                        .join(' · ')}</div>`
                    : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private async buildOrderEventEmail(
    event: NotificationEvent,
    context: RestaurantEmailContext,
  ): Promise<TransactionalEmailMessage> {
    const orderId = typeof event.payload.orderId === 'string' ? event.payload.orderId : null;
    const order = orderId
      ? await this.prisma.order.findFirst({
          where: { id: orderId, restaurantId: event.restaurantId },
        })
      : null;

    const payload = (order?.payload as Record<string, unknown> | null) || {};
    const status = String(order?.status || event.payload.status || 'updated').toLowerCase();
    const orderNumber = String(order?.orderNumber || event.payload.orderNumber || event.payload.orderId || 'your order');
    const customerName =
      typeof order?.customerName === 'string'
        ? order.customerName
        : typeof event.payload.customerName === 'string'
          ? event.payload.customerName
          : 'cher client';
    const customerPhone =
      typeof payload.customerPhone === 'string'
        ? payload.customerPhone
        : typeof event.payload.customerPhone === 'string'
          ? event.payload.customerPhone
          : null;
    const orderType = this.formatOrderType(payload.orderType);
    const estimatedReadyAt =
      typeof payload.readyAt === 'string'
        ? this.formatDateTime(payload.readyAt, context)
        : typeof event.payload.prepMinutes === 'number'
          ? `Environ ${event.payload.prepMinutes} minutes`
          : null;
    const totalAmount = this.formatCurrency(payload.totalAmount ?? order?.totalAmount?.toString(), context);
    const items = Array.isArray(payload.items)
      ? payload.items
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => {
            const name = typeof item.name === 'string' ? item.name : 'Article';
            const quantity = Number(item.quantity || 1);
            return `${quantity} × ${name}`;
          })
      : [];
    const statusContent = this.getOrderStatusContent(status);

    const detailRows = [
      { label: 'Référence de commande', value: orderNumber },
      ...(orderType ? [{ label: 'Type de commande', value: orderType }] : []),
      ...(estimatedReadyAt
        ? [{ label: status === 'accepted' ? 'Heure estimée' : 'Horaire', value: estimatedReadyAt }]
        : []),
      ...(customerPhone ? [{ label: 'Téléphone', value: customerPhone }] : []),
      ...(totalAmount ? [{ label: 'Total', value: totalAmount }] : []),
      ...(items.length > 0 ? [{ label: 'Récapitulatif', value: items.join(', ') }] : []),
    ];

    const subject = `${statusContent.subjectLabel} - ${context.name}${orderNumber ? ` - ${orderNumber}` : ''}`;
    const textLines = [
      `Bonjour ${customerName},`,
      '',
      statusContent.intro,
      '',
      `Restaurant : ${context.name}`,
      `Référence de commande : ${orderNumber}`,
      ...(orderType ? [`Type de commande : ${orderType}`] : []),
      ...(estimatedReadyAt ? [`${status === 'accepted' ? 'Heure estimée' : 'Horaire'} : ${estimatedReadyAt}`] : []),
      ...(customerPhone ? [`Téléphone : ${customerPhone}`] : []),
      ...(totalAmount ? [`Total : ${totalAmount}`] : []),
      ...(items.length > 0 ? ['Récapitulatif :', ...items.map((item) => `- ${item}`)] : []),
      '',
      `Statut : ${statusContent.badgeLabel}`,
      '',
      ...(context.contactPhone || context.contactEmail
        ? [`Pour toute question, contactez-nous${context.contactPhone ? ` au ${context.contactPhone}` : ''}${context.contactEmail ? ` ou par e-mail à ${context.contactEmail}` : ''}.`]
        : []),
      `Merci,`,
      context.name,
    ];

    return {
      subject,
      text: textLines.join('\n'),
      html: this.buildEmailShell({
        context,
        preheader: `${statusContent.subjectLabel} - ${orderNumber}`,
        title: statusContent.title,
        intro: `Bonjour ${customerName}, ${statusContent.intro.charAt(0).toLowerCase()}${statusContent.intro.slice(1)}`,
        badgeLabel: statusContent.badgeLabel,
        badgeBackground: statusContent.badgeBackground,
        badgeColor: statusContent.badgeColor,
        detailRows,
        closing:
          context.contactPhone || context.contactEmail
            ? `Si vous avez la moindre question, n’hésitez pas à nous contacter${context.contactPhone ? ` au ${context.contactPhone}` : ''}${context.contactEmail ? ` ou via ${context.contactEmail}` : ''}.`
            : 'Merci pour votre confiance.',
      }),
      debug: {
        logoUrl: context.logoUrl,
        logoSourcePath: context.logoSourcePath,
      },
    };
  }

  private async buildReservationEventEmail(
    event: NotificationEvent,
    context: RestaurantEmailContext,
  ): Promise<TransactionalEmailMessage> {
    const reservationId = typeof event.payload.reservationId === 'string' ? event.payload.reservationId : null;
    const reservation = reservationId
      ? await this.prisma.reservation.findFirst({
          where: { id: reservationId, restaurantId: event.restaurantId },
        })
      : null;

    const status = String(reservation?.status || event.payload.status || 'updated').toLowerCase();
    const reservationDate = this.formatDateTime(
      reservation?.reservationDate || (typeof event.payload.reservationDate === 'string' ? event.payload.reservationDate : null),
      context,
    );
    const customerName =
      typeof reservation?.customerName === 'string'
        ? reservation.customerName
        : typeof event.payload.customerName === 'string'
          ? event.payload.customerName
          : 'cher client';
    const guestCount =
      typeof reservation?.guestCount === 'number'
        ? reservation.guestCount
        : Number.isFinite(Number(event.payload.guestCount))
          ? Number(event.payload.guestCount)
          : null;
    const customerPhone =
      typeof reservation?.customerPhone === 'string'
        ? reservation.customerPhone
        : typeof event.payload.phone === 'string'
          ? event.payload.phone
          : null;
    const notes = typeof reservation?.notes === 'string' ? reservation.notes : null;
    const statusContent = this.getReservationStatusContent(status);
    const guestLabel = guestCount ? `${guestCount} personne${guestCount > 1 ? 's' : ''}` : null;

    const detailRows = [
      ...(reservationDate ? [{ label: 'Date et heure', value: reservationDate }] : []),
      ...(guestLabel ? [{ label: 'Nombre de personnes', value: guestLabel }] : []),
      ...(customerName ? [{ label: 'Nom du client', value: customerName }] : []),
      ...(customerPhone ? [{ label: 'Téléphone', value: customerPhone }] : []),
      { label: 'Statut', value: statusContent.badgeLabel },
    ];

    const subject = `${statusContent.subjectLabel} - ${context.name}`;
    const textLines = [
      `Bonjour ${customerName},`,
      '',
      statusContent.intro,
      '',
      `Restaurant : ${context.name}`,
      ...(reservationDate ? [`Date et heure : ${reservationDate}`] : []),
      ...(guestLabel ? [`Nombre de personnes : ${guestLabel}`] : []),
      ...(customerPhone ? [`Téléphone : ${customerPhone}`] : []),
      `Statut : ${statusContent.badgeLabel}`,
      ...(notes ? ['', 'Notes :', notes] : []),
      '',
      ...(context.contactPhone || context.contactEmail
        ? [`Si vous avez besoin de nous joindre, contactez-nous${context.contactPhone ? ` au ${context.contactPhone}` : ''}${context.contactEmail ? ` ou par e-mail à ${context.contactEmail}` : ''}.`]
        : []),
      `Merci,`,
      context.name,
    ];

    return {
      subject,
      text: textLines.join('\n'),
      html: this.buildEmailShell({
        context,
        preheader: `${statusContent.subjectLabel} - ${context.name}`,
        title: statusContent.title,
        intro: `Bonjour ${customerName}, ${statusContent.intro.charAt(0).toLowerCase()}${statusContent.intro.slice(1)}`,
        badgeLabel: statusContent.badgeLabel,
        badgeBackground: statusContent.badgeBackground,
        badgeColor: statusContent.badgeColor,
        detailRows,
        notes,
        closing:
          context.contactPhone || context.contactEmail
            ? `Si vous souhaitez modifier votre réservation, contactez-nous${context.contactPhone ? ` au ${context.contactPhone}` : ''}${context.contactEmail ? ` ou via ${context.contactEmail}` : ''}.`
            : 'Au plaisir de vous accueillir.',
      }),
      debug: {
        logoUrl: context.logoUrl,
        logoSourcePath: context.logoSourcePath,
      },
    };
  }

  private async buildEventEmail(event: NotificationEvent): Promise<TransactionalEmailMessage> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: event.restaurantId },
      select: {
        id: true,
        name: true,
        branding: true,
        contactInfo: true,
        timezone: true,
        locale: true,
        currency: true,
      },
    });

    const context = this.getRestaurantEmailContext(
      restaurant || {
        id: event.restaurantId,
        name: 'Notre restaurant',
        branding: null,
        contactInfo: null,
        timezone: 'Europe/Zurich',
        locale: 'fr-CH',
        currency: 'CHF',
      },
    );

    if (event.type === 'order.status_changed') {
      return this.buildOrderEventEmail(event, context);
    }

    return this.buildReservationEventEmail(event, context);
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

    const message = await this.buildEventEmail(event);
    const htmlContainsFrenchMarker = /bonjour|commande|réservation|confirmation client/i.test(message.html);
    const htmlContainsLogoImg = /<img\s/i.test(message.html);
    const htmlContainsBlackWhitePalette = message.html.includes('#111111') && message.html.includes('#f3f4f6');
    const htmlLogoSrc = message.html ? this.extractFirstImageSrc(message.html) : null;

    this.logger.log(
      JSON.stringify({
        event: 'transactional_email_rendered',
        notificationType: event.type,
        restaurantId: event.restaurantId,
        recipient,
        subject: message.subject,
        hasHtml: Boolean(message.html),
        mimeMode: message.html ? 'multipart_alternative' : 'text_only',
        htmlContainsFrenchMarker,
        htmlContainsLogoImg,
        htmlContainsBlackWhitePalette,
        resolvedLogoUrl: message.debug.logoUrl,
        logoSourcePath: message.debug.logoSourcePath,
        htmlLogoSrc,
        logoDiagnostic:
          message.debug.logoUrl && htmlContainsLogoImg
            ? 'logo_img_rendered_in_html'
            : message.debug.logoUrl
              ? 'logo_url_present_but_img_missing'
              : 'logo_data_missing_or_unusable',
      }),
    );

    const result = await this.sendViaSmtp({
      config: smtpConfig,
      to: recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
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
