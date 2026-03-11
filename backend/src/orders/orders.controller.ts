import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { CreateStorefrontOrderDto } from './dto/create-storefront-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(TenantContextGuard)
  async create(
    @TenantCtx() tenant: TenantContext,
    @Body() dto: CreateStorefrontOrderDto,
    @Headers('authorization') authorization?: string,
  ) {
    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length);
      const customer = this.authService.verifyAccessToken(token, 'customer');
      if (customer.restaurantId !== tenant.restaurantId) {
        throw new UnauthorizedException({
          error: 'TENANT_CONTEXT_MISMATCH',
          message: 'Customer token restaurant does not match request tenant context.',
        });
      }
    }

    const order = await this.ordersService.createStorefrontOrder(tenant.restaurantId, dto);
    return ok({ order });
  }

  @Get(':orderNumber')
  @UseGuards(TenantContextGuard)
  async getByOrderNumber(@TenantCtx() tenant: TenantContext, @Param('orderNumber') orderNumber: string) {
    const order = await this.ordersService.getStorefrontOrderByNumber(tenant.restaurantId, orderNumber);
    return ok({ order });
  }
}
