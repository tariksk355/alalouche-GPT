import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';

class StorefrontOrderItemDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateStorefrontOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ValidateIf((dto: CreateStorefrontOrderDto) => dto.orderType === 'delivery' || dto.customerAddress !== undefined)
  @IsString()
  @IsNotEmpty()
  customerAddress?: string;

  @IsIn(['takeaway', 'delivery'])
  orderType!: 'takeaway' | 'delivery';

  @IsIn(['cash', 'card'])
  paymentMethod!: 'cash' | 'card';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StorefrontOrderItemDto)
  items!: StorefrontOrderItemDto[];
}
