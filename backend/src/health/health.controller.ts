import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ok } from '../common/api-response';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  health() {
    return ok({
      status: 'ok',
      service: 'backend',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return ok({
        status: 'ready',
        checks: { database: 'ok' },
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    } catch {
      throw new ServiceUnavailableException({
        error: 'NOT_READY',
        message: 'Readiness check failed: database unavailable.',
      });
    }
  }
}
