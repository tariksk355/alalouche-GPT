import { HttpException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as net from 'node:net';

type RedisPrimitive = string | number | null;
type RedisReply = RedisPrimitive | RedisReply[];

type RedisConnectionConfig = {
  host: string;
  port: number;
  password: string | null;
  db: number | null;
};

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisUrl = process.env.REDIS_URL?.trim() || '';
  private lastWarningAt = 0;

  isConfigured(): boolean {
    return Boolean(this.redisUrl);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.warnSoft(`Invalid cached JSON for key ${key}: ${this.toErrorMessage(error)}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const result = await this.runCommands([
      ['SET', key, JSON.stringify(value), 'EX', String(Math.max(1, Math.floor(ttlSeconds)))],
    ]);

    return result?.[0] === 'OK';
  }

  async deleteKeys(...keys: string[]): Promise<void> {
    const filtered = keys.filter(Boolean);
    if (filtered.length === 0) return;
    await this.runCommands([['DEL', ...filtered]]);
  }

  async incrementWindow(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number } | null> {
    const replies = await this.runCommands([
      ['INCR', key],
      ['EXPIRE', key, String(Math.max(1, Math.floor(windowSeconds))), 'NX'],
      ['TTL', key],
    ]);

    if (!replies || typeof replies[0] !== 'number') {
      return null;
    }

    return {
      count: replies[0],
      ttlSeconds: typeof replies[2] === 'number' && replies[2] > 0 ? replies[2] : Math.max(1, Math.floor(windowSeconds)),
    };
  }

  buildRateLimitKey(scope: string, ...parts: Array<string | null | undefined>): string {
    const normalized = parts
      .map((part) => part?.trim())
      .filter(Boolean)
      .join('|');
    const digest = createHash('sha256').update(normalized || 'anonymous').digest('hex');
    return `rate-limit:${scope}:${digest}`;
  }

  throwTooManyRequests(message: string, retryAfterSeconds: number): never {
    throw new HttpException(
      {
        error: 'RATE_LIMITED',
        message,
        retryAfterSeconds,
      },
      429,
    );
  }

  private async get(key: string): Promise<string | null> {
    const result = await this.runCommands([['GET', key]]);
    return typeof result?.[0] === 'string' ? result[0] : null;
  }

  private async runCommands(commands: string[][]): Promise<RedisReply[] | null> {
    if (!this.redisUrl) {
      return null;
    }

    try {
      const config = this.parseRedisUrl(this.redisUrl);
      const bootstrapCommands = [
        ...(config.password ? [['AUTH', config.password]] : []),
        ...(typeof config.db === 'number' && config.db > 0 ? [['SELECT', String(config.db)]] : []),
        ...commands,
      ];
      const replies = await this.executeCommands(config, bootstrapCommands);
      return replies.slice(bootstrapCommands.length - commands.length);
    } catch (error) {
      this.warnSoft(`Redis unavailable; bypassing helper behavior. ${this.toErrorMessage(error)}`);
      return null;
    }
  }

  private executeCommands(config: RedisConnectionConfig, commands: string[][]): Promise<RedisReply[]> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: config.host, port: config.port });
      const chunks: Buffer[] = [];
      const replies: RedisReply[] = [];
      let settled = false;

      const finish = (handler: () => void) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        handler();
      };

      socket.setTimeout(1000);

      socket.on('connect', () => {
        const payload = commands.map((command) => this.encodeCommand(command)).join('');
        socket.write(payload);
      });

      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        let offset = 0;

        try {
          while (offset < buffer.length && replies.length < commands.length) {
            const parsed = this.parseReply(buffer, offset);
            if (!parsed) break;
            replies.push(parsed.value);
            offset = parsed.nextOffset;
          }
        } catch (error) {
          finish(() => reject(error));
          return;
        }

        if (replies.length === commands.length) {
          finish(() => resolve(replies));
        } else if (offset > 0) {
          const remaining = buffer.subarray(offset);
          chunks.length = 0;
          if (remaining.length > 0) chunks.push(remaining);
        }
      });

      socket.on('timeout', () => finish(() => reject(new Error('Redis socket timeout'))));
      socket.on('error', (error) => finish(() => reject(error)));
      socket.on('end', () => {
        if (!settled && replies.length < commands.length) {
          finish(() => reject(new Error('Redis socket closed before all replies were received')));
        }
      });
    });
  }

  private encodeCommand(parts: string[]): string {
    const encodedParts = parts.map((part) => {
      const value = String(part);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    }).join('');

    return `*${parts.length}\r\n${encodedParts}`;
  }

  private parseReply(buffer: Buffer, offset: number): { value: RedisReply; nextOffset: number } | null {
    if (offset >= buffer.length) return null;
    const prefix = String.fromCharCode(buffer[offset]);

    if (prefix === '+') {
      const line = this.readLine(buffer, offset + 1);
      if (!line) return null;
      return { value: line.value, nextOffset: line.nextOffset };
    }

    if (prefix === '-') {
      const line = this.readLine(buffer, offset + 1);
      if (!line) return null;
      throw new Error(`Redis error reply: ${line.value}`);
    }

    if (prefix === ':') {
      const line = this.readLine(buffer, offset + 1);
      if (!line) return null;
      return { value: Number(line.value), nextOffset: line.nextOffset };
    }

    if (prefix === '$') {
      const line = this.readLine(buffer, offset + 1);
      if (!line) return null;
      const size = Number(line.value);
      if (size === -1) {
        return { value: null, nextOffset: line.nextOffset };
      }

      const end = line.nextOffset + size;
      if (buffer.length < end + 2) return null;
      return {
        value: buffer.toString('utf8', line.nextOffset, end),
        nextOffset: end + 2,
      };
    }

    if (prefix === '*') {
      const line = this.readLine(buffer, offset + 1);
      if (!line) return null;
      const count = Number(line.value);
      if (count === -1) {
        return { value: null, nextOffset: line.nextOffset };
      }

      const values: RedisReply[] = [];
      let nextOffset = line.nextOffset;
      for (let index = 0; index < count; index += 1) {
        const parsed = this.parseReply(buffer, nextOffset);
        if (!parsed) return null;
        values.push(parsed.value);
        nextOffset = parsed.nextOffset;
      }

      return { value: values, nextOffset };
    }

    throw new Error(`Unsupported Redis response prefix: ${prefix}`);
  }

  private readLine(buffer: Buffer, offset: number): { value: string; nextOffset: number } | null {
    const end = buffer.indexOf('\r\n', offset, 'utf8');
    if (end < 0) return null;
    return {
      value: buffer.toString('utf8', offset, end),
      nextOffset: end + 2,
    };
  }

  private parseRedisUrl(redisUrl: string): RedisConnectionConfig {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== 'redis:') {
      throw new Error(`Unsupported REDIS_URL protocol: ${parsed.protocol}`);
    }

    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? Number(parsed.port) : 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : null,
      db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.replace('/', '')) : null,
    };
  }

  private warnSoft(message: string) {
    const now = Date.now();
    if (now - this.lastWarningAt < 30000) {
      return;
    }

    this.lastWarningAt = now;
    this.logger.warn(message);
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
