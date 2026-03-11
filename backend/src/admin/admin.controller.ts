import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ok } from '../common/api-response';
import { OrdersService } from '../orders/orders.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly ordersService: OrdersService) {}

  private requireAdmin(adminToken?: string) {
    const expected = process.env.ADMIN_TOKEN || 'dev-admin';
    if (!adminToken || adminToken !== expected) {
      throw new UnauthorizedException({ error: 'ADMIN_AUTH_REQUIRED', message: 'Admin token is required.' });
    }
  }

  @Get('kpis')
  async getKpis(@Headers('x-admin-token') adminToken?: string) {
    this.requireAdmin(adminToken);
    const kpis = await this.ordersService.getDailyKpis();
    return ok(kpis);
  }
}