import { Body, Controller, Headers, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/api-response';
import { TenantContextGuard } from '../tenant/tenant-context.guard';
import { TenantCtx } from '../tenant/tenant.decorator';
import { TenantContext } from '../tenant/tenant.types';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(TenantContextGuard)
  async create(
    @TenantCtx() tenant: TenantContext,
    @Body() dto: CreateReservationDto,
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

    const reservation = await this.reservationsService.createReservation(tenant.restaurantId, dto);
    return ok({ reservation });
  }
}
