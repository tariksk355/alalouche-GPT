import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ok } from '../common/api-response';
import { CreatePairingCodeDto } from './dto/create-pairing-code.dto';
import { CreatePairingRequestDto } from './dto/create-pairing-request.dto';
import { VerifyDeviceDto } from './dto/verify-device.dto';
import { DevicePairingService } from './device-pairing.service';

@Controller()
export class DevicePairingController {
  constructor(private readonly pairingService: DevicePairingService) {}

  @Post('admin/device-pairing-codes')
  async createCode(@Body() dto: CreatePairingCodeDto, @Headers('x-admin-token') adminToken?: string) {
    const pairingCode = await this.pairingService.createPairingCode(dto, adminToken);
    return ok({ pairingCodeId: pairingCode.id, code: pairingCode.code, expiresAt: pairingCode.expiresAt });
  }

  @Post('devices/pairing-requests')
  async createRequest(@Body() dto: CreatePairingRequestDto) {
    const request = await this.pairingService.createPairingRequest(dto);
    return ok({ pairingRequestId: request.id, status: request.status });
  }

  @Get('admin/device-pairing-requests')
  async listRequests(@Headers('x-admin-token') adminToken?: string) {
    const requests = await this.pairingService.listRequests(adminToken);
    return ok({ requests });
  }

  @Post('admin/device-pairing-requests/:id/confirm')
  async confirm(@Param('id') id: string, @Headers('x-admin-token') adminToken?: string) {
    const request = await this.pairingService.confirmRequest(id, adminToken);
    return ok({ pairingRequestId: request.id, deviceId: request.deviceId });
  }

  @Post('devices/verify')
  async verify(@Body() dto: VerifyDeviceDto) {
    const status = await this.pairingService.verify(dto.pairingRequestId);
    return ok(status);
  }
}
