import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { DeviceCtx } from '../device-auth/device.decorator';
import { DevicePairingService } from '../device-pairing/device-pairing.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicePairingService: DevicePairingService) {}

  @Get('me')
  @UseGuards(DeviceAuthGuard)
  me(@DeviceCtx() device: any) {
    return ok({
      id: device.id,
      deviceName: device.deviceName,
      deviceModel: device.deviceModel,
      platform: device.platform,
      status: device.status,
      restaurantId: device.restaurantId,
    });
  }

  @Post('revoke-self')
  @UseGuards(DeviceAuthGuard)
  async revokeSelf(@DeviceCtx() device: any) {
    const revoked = await this.devicePairingService.revokeCurrentDevice(device.id);
    return ok({ device: revoked });
  }
}
