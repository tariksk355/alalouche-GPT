import { Body, Controller, Get, Headers, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { CreateStorefrontOrderDto } from './dto/create-storefront-order.dto';
import { PreviewStorefrontPromotionDto } from './dto/preview-storefront-promotion.dto';
import { OrdersService } from './orders.service';
import { RedisRateLimitService } from '../redis/redis-rate-limit.service';
import { Request } from 'express';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly authService: AuthService,
    private readonly redisRateLimitService: RedisRateLimitService,
  ) {}

  @Post()
  @UseGuards(TenantContextGuard)
  async create(
    @TenantCtx() tenant: TenantContext,
    @Body() dto: CreateStorefrontOrderDto,
    @Req() request: Request,
    @Headers('authorization') authorization?: string,
  ) {
    await this.redisRateLimitService.enforce({
      request,
      scope: 'order-create',
      restaurantId: tenant.restaurantId,
      limit: 8,
      windowSeconds: 300,
      identifiers: [dto.customerEmail?.toLowerCase() || null, dto.customerPhone],
      message: 'Trop de commandes créées en peu de temps. Veuillez patienter avant de recommencer.',
    });

    let customerId: string | null = null;
    let customerEmail: string | null = null;

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length);
      const customer = this.authService.verifyAccessToken(token, 'customer');
      if (customer.restaurantId !== tenant.restaurantId) {
        throw new UnauthorizedException({
          error: 'TENANT_CONTEXT_MISMATCH',
          message: 'Customer token restaurant does not match request tenant context.',
        });
      }

      customerId = customer.sub;
      customerEmail = customer.email || null;
    }

    const order = await this.ordersService.createStorefrontOrder(tenant.restaurantId, dto, {
      customerId,
      customerEmail,
    });
    return ok({ order });
  }

  @Post('promotion-preview')
  @UseGuards(TenantContextGuard)
  async previewPromotion(
    @TenantCtx() tenant: TenantContext,
    @Body() dto: PreviewStorefrontPromotionDto,
    @Headers('authorization') authorization?: string,
  ) {
    let customerId: string | null = null;
    let customerEmail: string | null = null;

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length);
      const customer = this.authService.verifyAccessToken(token, 'customer');
      if (customer.restaurantId !== tenant.restaurantId) {
        throw new UnauthorizedException({
          error: 'TENANT_CONTEXT_MISMATCH',
          message: 'Customer token restaurant does not match request tenant context.',
        });
      }

      customerId = customer.sub;
      customerEmail = customer.email || null;
    }

    const promotion = await this.ordersService.previewStorefrontPromotion(tenant.restaurantId, dto, {
      customerId,
      customerEmail,
    });

    return ok({ promotion });
  }

  @Get('me/history')
  @UseGuards(TenantContextGuard)
  async getMyOrders(@TenantCtx() tenant: TenantContext, @Headers('authorization') authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'AUTH_REQUIRED',
        message: 'Customer bearer token required.',
      });
    }

    const token = authorization.slice('Bearer '.length);
    const customer = this.authService.verifyAccessToken(token, 'customer');
    if (customer.restaurantId !== tenant.restaurantId) {
      throw new UnauthorizedException({
        error: 'TENANT_CONTEXT_MISMATCH',
        message: 'Customer token restaurant does not match request tenant context.',
      });
    }

    const orders = await this.ordersService.listCustomerOrders(tenant.restaurantId, {
      customerId: customer.sub,
      customerEmail: customer.email || null,
    });
    return ok({ orders });
  }

  @Get(':orderNumber')
  @UseGuards(TenantContextGuard)
  async getByOrderNumber(@TenantCtx() tenant: TenantContext, @Param('orderNumber') orderNumber: string) {
    const order = await this.ordersService.getStorefrontOrderByNumber(tenant.restaurantId, orderNumber);
    return ok({ order });
  }
}
