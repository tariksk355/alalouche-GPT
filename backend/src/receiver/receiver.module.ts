import { Module } from '@nestjs/common';
import { ReceiverController } from './receiver.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({ imports: [OrdersModule], controllers: [ReceiverController] })
export class ReceiverModule {}
