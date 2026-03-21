import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';

class StorefrontPromotionPreviewItemDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class PreviewStorefrontPromotionDto {
  @IsString()
  @MinLength(3)
  promotionCode!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StorefrontPromotionPreviewItemDto)
  items!: StorefrontPromotionPreviewItemDto[];
}
