import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePairingCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  restaurantId?: string;
}
