import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendAdminMarketingEmailDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedCustomerIds?: string[];

  @IsOptional()
  @IsString()
  promotionId?: string;
}
