import { IsIn } from 'class-validator';

export class UpdateAdminReservationStatusDto {
  @IsIn(['confirmed', 'cancelled'])
  status!: 'confirmed' | 'cancelled';
}
