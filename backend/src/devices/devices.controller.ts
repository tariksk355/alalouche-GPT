import { Controller, Get, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { DeviceCtx } from '../device-auth/device.decorator';

@Controller('devices')
export class DevicesController {
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
}
