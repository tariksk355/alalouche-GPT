import { HttpException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from './redis.service';

@Injectable()
export class RedisRateLimitService {
  constructor(private readonly redisService: RedisService) {}

  async enforce(options: {
    request: Request;
    scope: string;
    limit: number;
    windowSeconds: number;
    restaurantId?: string | null;
    identifiers?: Array<string | null | undefined>;
    message: string;
  }): Promise<void> {
    if (!this.redisService.isConfigured()) {
      return;
    }

    const ip = this.getRequestIp(options.request);
    const key = this.redisService.buildRateLimitKey(
      options.scope,
      options.restaurantId || null,
      ip,
      ...(options.identifiers || []),
    );

    const result = await this.redisService.incrementWindow(key, options.windowSeconds);
    if (!result) {
      return;
    }

    if (result.count > options.limit) {
      throw new HttpException({
        error: 'RATE_LIMITED',
        message: options.message,
        retryAfterSeconds: result.ttlSeconds,
      }, 429);
    }
  }

  private getRequestIp(request: Request): string {
    const forwardedFor = request.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwardedFor) {
      return forwardedFor;
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
