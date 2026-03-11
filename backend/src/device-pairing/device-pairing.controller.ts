import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ok } from '../common/api-response';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';
import { CreatePairingRequestDto } from './dto/create-pairing-request.dto';
import { VerifyDeviceDto } from './dto/verify-device.dto';
import { DevicePairingService } from './device-pairing.service';

interface PairingAdminContext {
  restaurantId: string;
  actor: string;
}

@Controller()
export class DevicePairingController {
  constructor(
    private readonly pairingService: DevicePairingService,
    private readonly authService: AuthService,
  ) {}

  @Post('admin/device-pairing-codes')
  async createCode(
    @Body() dto: CreatePairingCodeDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const admin = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const pairingCode = await this.pairingService.createPairingCode(dto, admin);
    return ok({ pairingCodeId: pairingCode.id, code: pairingCode.code, expiresAt: pairingCode.expiresAt });
  }

  @Post('devices/pairing-requests')
  async createRequest(@Body() dto: CreatePairingRequestDto) {
    const request = await this.pairingService.createPairingRequest(dto);
    return ok({ pairingRequestId: request.id, status: request.status });
  }

  @Get('admin/device-pairing-requests')
  async listRequests(
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const admin = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const requests = await this.pairingService.listRequests(admin);
    return ok({ requests });
  }

  @Post('admin/device-pairing-requests/:id/confirm')
  async confirm(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-admin-token') adminToken?: string,
    @Headers('x-restaurant-id') legacyRestaurantId?: string,
  ) {
    const admin = this.requireAdmin(authorization, adminToken, legacyRestaurantId);
    const request = await this.pairingService.confirmRequest(id, admin);
    return ok({ pairingRequestId: request.id, deviceId: request.deviceId });
  }

  @Post('devices/verify')
  async verify(@Body() dto: VerifyDeviceDto) {
    const status = await this.pairingService.verify(dto.pairingRequestId);
    return ok(status);
  }

  private requireAdmin(authorization?: string, adminToken?: string, legacyRestaurantId?: string): PairingAdminContext {
    if (authorization?.startsWith('Bearer ')) {
      const bearer = authorization.slice('Bearer '.length);
      const payload = this.authService.verifyAccessToken(bearer, 'admin');
      return {
        restaurantId: payload.restaurantId,
        actor: payload.username || payload.sub,
      };
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new UnauthorizedException({
        error: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin bearer token is required for pairing admin operations.',
      });
    }

    const expected = process.env.ADMIN_TOKEN || 'dev-admin';
    if (!adminToken || adminToken !== expected || !legacyRestaurantId) {
      throw new UnauthorizedException({
        error: 'ADMIN_AUTH_REQUIRED',
        message: 'Admin bearer token is required. Legacy x-admin-token also requires x-restaurant-id (non-production only).',
      });
    }

    return {
      restaurantId: legacyRestaurantId,
      actor: 'legacy_admin',
    };
  }
}
