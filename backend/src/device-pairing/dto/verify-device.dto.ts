import { IsString } from 'class-validator';

export class VerifyDeviceDto {
  @IsString()
  pairingRequestId!: string;
}
