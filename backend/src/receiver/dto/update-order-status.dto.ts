import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['accepted', 'ready', 'completed'])
  status!: 'accepted' | 'ready' | 'completed';
}
