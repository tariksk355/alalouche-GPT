import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CustomerSignupDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  subscribedEmail?: boolean;
}