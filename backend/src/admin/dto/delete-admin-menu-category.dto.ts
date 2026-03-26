import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteAdminMenuCategoryDto {
  @IsString()
  @MaxLength(120)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetCategory?: string;

  @IsOptional()
  @IsBoolean()
  clearCategory?: boolean;
}
