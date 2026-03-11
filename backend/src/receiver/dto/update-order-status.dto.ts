import { IsIn, IsOptional } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['accepted', 'ready', 'completed'])
  status!: 'accepted' | 'ready' | 'completed';

  @IsOptional()
  @IsIn([15, 30, 45, 60])
  prepMinutes?: 15 | 30 | 45 | 60;
}