import { Module } from '@nestjs/common';
import { DevicePairingModule } from '../device-pairing/device-pairing.module';
import { DevicesController } from './devices.controller';

@Module({ imports: [DevicePairingModule], controllers: [DevicesController] })
export class DevicesModule {}
