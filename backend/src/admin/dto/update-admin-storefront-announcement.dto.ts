import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminStorefrontAnnouncementDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string;
}
