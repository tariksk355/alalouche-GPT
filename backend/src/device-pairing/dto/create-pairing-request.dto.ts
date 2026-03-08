import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreatePairingRequestDto {
  @IsString()
  @Length(4, 12)
  pairingCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  installId?: string;
}
