import { Global, Module } from '@nestjs/common';
import { RedisRateLimitService } from './redis-rate-limit.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, RedisRateLimitService],
  exports: [RedisService, RedisRateLimitService],
})
export class RedisModule {}
