import { IsObject, IsOptional } from 'class-validator';

export class UpdateAdminMenuProductOrderByCategoryDto {
  @IsOptional()
  @IsObject()
  productOrderByCategory?: Record<string, unknown>;
}
