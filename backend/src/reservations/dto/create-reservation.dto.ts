import { IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  date!: string;

  @IsString()
  time!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  guests!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}