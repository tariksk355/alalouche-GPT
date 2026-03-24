import { Body, Controller, Headers, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';
import { RedisRateLimitService } from '../redis/redis-rate-limit.service';
import { Request } from 'express';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly authService: AuthService,
    private readonly redisRateLimitService: RedisRateLimitService,
  ) {}

  @Post()
  @UseGuards(TenantContextGuard)
  async create(
    @TenantCtx() tenant: TenantContext,
    @Body() dto: CreateReservationDto,
    @Req() request: Request,
    @Headers('authorization') authorization?: string,
  ) {
    await this.redisRateLimitService.enforce({
      request,
      scope: 'reservation-create',
      restaurantId: tenant.restaurantId,
      limit: 10,
      windowSeconds: 600,
      identifiers: [dto.email.toLowerCase()],
      message: 'Trop de demandes de réservation envoyées. Veuillez patienter avant de recommencer.',
    });

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

    const reservation = await this.reservationsService.createReservation(tenant.restaurantId, dto);
    return ok({ reservation });
  }
}
