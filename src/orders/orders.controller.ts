import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { VerifiedEmailGuard } from '../common/guards/verified-email.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  listOwn(@CurrentUser() user: SessionUser, @Query() dto: ListOrdersDto) {
    return this.ordersService.listOwn(user.id, dto);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.ordersService.findById(id, user.id);
  }

  /**
   * Endpoint provisoire : il sera déclenché par le webhook de paiement
   * (Stripe / Wave) plutôt que par le client une fois l'encaissement branché.
   *
   * Email vérifié exigé : c'est le point où l'argent change de main.
   *
   * ⚠️ En l'état, aucun euro ne bouge : le service se contente de croire
   * l'appelant. Il refuse donc de s'exécuter en production — voir le
   * commentaire de `OrdersService.confirmPayment`.
   */
  @UseGuards(VerifiedEmailGuard)
  @Patch(':id/confirm')
  confirmPayment(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.ordersService.confirmPayment(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.ordersService.cancel(id, user.id);
  }
}
