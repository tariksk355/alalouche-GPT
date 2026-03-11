import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ok } from '../common/api-response';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
  ) {}

  private requireAdmin(adminToken?: string, authorization?: string) {
    if (authorization?.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length);
      this.authService.verifyAccessToken(bearer, 'admin');
      return;
    }

    const expected = process.env.ADMIN_TOKEN || 'dev-admin';
    if (!adminToken || adminToken !== expected) {
      throw new UnauthorizedException({ error: 'ADMIN_AUTH_REQUIRED', message: 'Admin token is required.' });
    }
  }

  @Get('kpis')
  async getKpis(
    @Headers('x-admin-token') adminToken?: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireAdmin(adminToken, authorization);
    const kpis = await this.ordersService.getDailyKpis();
    return ok(kpis);
  }
}