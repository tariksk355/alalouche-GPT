import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from './device-auth.guard';

@Module({ providers: [DeviceAuthGuard], exports: [DeviceAuthGuard] })
export class DeviceAuthModule {}
