import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminMenuCategoryOrderDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  categoryOrder?: string[];
}
