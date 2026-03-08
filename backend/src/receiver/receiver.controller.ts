import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { DeviceCtx } from '../device-auth/device.decorator';
import { OrdersService } from '../orders/orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('receiver')
@UseGuards(DeviceAuthGuard)
export class ReceiverController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('orders')
  async getOrders(@DeviceCtx() device: any) {
    const orders = await this.ordersService.listOpenOrders(device.restaurantId);
    return ok({ orders });
  }

  @Post('orders/:id/status')
  async updateOrderStatus(@DeviceCtx() device: any, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    const order = await this.ordersService.updateStatus(device.restaurantId, id, dto.status);
    return ok({ order });
  }
}
