import { IsIn } from 'class-validator';

export class UpdateReservationStatusDto {
  @IsIn(['confirmed', 'cancelled'])
  status!: 'confirmed' | 'cancelled';
}