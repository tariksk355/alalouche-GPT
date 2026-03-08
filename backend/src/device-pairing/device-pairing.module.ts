import { Module } from '@nestjs/common';
import { DevicePairingController } from './device-pairing.controller';
import { DevicePairingService } from './device-pairing.service';

@Module({ controllers: [DevicePairingController], providers: [DevicePairingService] })
export class DevicePairingModule {}
