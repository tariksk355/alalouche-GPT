import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AccessTokenPayload } from '../auth/token.service';
import { ok } from '../common/api-response';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
  ) {}

  private requireAdmin(authorization?: string, adminToken?: string, legacyRestaurantId?: string): AccessTokenPayload {
    if (authorization?.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length);
      return this.authService.verifyAccessToken(bearer, 'admin');
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new UnauthorizedException({
        error: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin bearer token is required.',
      });
    }

    // Legacy compatibility path (non-production only): stub admin header token + explicit restaurant header.
    const expected = process.env.ADMIN_TOKEN || 'dev-admin';
    if (!adminToken || adminToken !== expected || !legacyRestaurantId) {
      throw new UnauthorizedException({
        error: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin bearer token is required. Legacy x-admin-token also requires x-restaurant-id.',
      });
    }

    return {
      sub: 'legacy-admin-token',
      role: 'admin',
      restaurantId: legacyRestaurantId,
      username: 'legacy_admin',
    };
  }

  @Get('kpis')
  async getKpis(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const auth = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const kpis = await this.ordersService.getDailyKpis(auth.restaurantId);
    return ok(kpis);
  }
}
