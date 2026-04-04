import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisUrl = process.env.REDIS_URL?.trim() || '';
  private client: RedisClient | null = null;
  private connectPromise: Promise<RedisClient | null> | null = null;
  private lastWarningAt = 0;

  isConfigured(): boolean {
    return Boolean(this.redisUrl);
  }

  async onModuleDestroy() {
    if (!this.client) {
      return;
    }

    try {
      await this.client.disconnect();
    } catch {
      // Best-effort shutdown only.
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    if (!client) {
      return null;
    }

    try {
      const value = await client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.warnSoft(`Redis read failed for ${key}; bypassing cache. ${this.toErrorMessage(error)}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const client = await this.getClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.set(key, JSON.stringify(value), { EX: Math.max(1, Math.floor(ttlSeconds)) });
      return result === 'OK';
    } catch (error) {
      this.warnSoft(`Redis write failed for ${key}; bypassing cache. ${this.toErrorMessage(error)}`);
      return false;
    }
  }

  async deleteKeys(...keys: string[]): Promise<void> {
    const filtered = keys.filter(Boolean);
    if (filtered.length === 0) return;

    const client = await this.getClient();
    if (!client) {
      return;
    }

    try {
      await client.del(filtered);
    } catch (error) {
      this.warnSoft(`Redis delete failed for ${filtered.join(', ')}. ${this.toErrorMessage(error)}`);
    }
  }

  async incrementWindow(key: string, windowSeconds: number): Promise<{ count: number; ttlSeconds: number } | null> {
    const client = await this.getClient();
    if (!client) {
      return null;
    }

    try {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, Math.max(1, Math.floor(windowSeconds)));
      }

      const ttlSeconds = await client.ttl(key);
      return {
        count,
        ttlSeconds: ttlSeconds > 0 ? ttlSeconds : Math.max(1, Math.floor(windowSeconds)),
      };
    } catch (error) {
      this.warnSoft(`Redis rate-limit counter failed for ${key}. ${this.toErrorMessage(error)}`);
      return null;
    }
  }

  buildRateLimitKey(scope: string, ...parts: Array<string | null | undefined>): string {
    const normalized = parts
      .map((part) => part?.trim())
      .filter(Boolean)
      .join('|');
    const digest = createHash('sha256').update(normalized || 'anonymous').digest('hex');
    return `rate-limit:${scope}:${digest}`;
  }

  private async getClient(): Promise<RedisClient | null> {
    if (!this.redisUrl) {
      return null;
    }

    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const client = createClient({ url: this.redisUrl });
    client.on('error', (error) => {
      this.warnSoft(`Redis client error; continuing without Redis helper behavior. ${this.toErrorMessage(error)}`);
    });

    this.client = client;
    this.connectPromise = client.connect()
      .then(() => client)
      .catch((error) => {
        this.client = null;
        this.warnSoft(`Redis connection failed; bypassing helper behavior. ${this.toErrorMessage(error)}`);
        return null;
      })
      .finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
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
