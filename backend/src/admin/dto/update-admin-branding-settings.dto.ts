import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminBrandingSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string;
}
