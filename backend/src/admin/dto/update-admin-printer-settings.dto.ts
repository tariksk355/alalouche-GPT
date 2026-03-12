import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateAdminPrinterSettingsDto {
  @IsOptional()
  @IsBoolean()
  auto_print?: boolean;

  @IsOptional()
  @IsIn(['58mm', '80mm'])
  paper_width?: '58mm' | '80mm';

  @IsOptional()
  @IsInt()
  @Min(1)
  copies?: number;

  @IsOptional()
  @IsIn([15, 30, 45, 60])
  default_prep_time?: 15 | 30 | 45 | 60;

  @IsOptional()
  @IsBoolean()
  require_prep_time?: boolean;
}
