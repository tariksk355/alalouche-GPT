import { Controller, Get } from '@nestjs/common';
import { ok } from '../common/api-response';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return ok({ status: 'ok', service: 'backend', timestamp: new Date().toISOString() });
  }
}
