import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { OpenDirectDto } from './dto/open-direct.dto';
import { SendMessageDto } from './dto/send-message.dto';

/**
 * Complément REST de la passerelle WebSocket.
 *
 * L'historique passe par HTTP : le charger via WebSocket obligerait à
 * attendre la connexion avant d'afficher quoi que ce soit, et empêcherait
 * toute mise en cache. L'envoi est également exposé ici comme repli lorsque
 * la WebSocket est coupée — situation courante sur un réseau instable.
 */
@UseGuards(AuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  /** L'onglet Messages. */
  @Get()
  listConversations(@CurrentUser() user: SessionUser) {
    return this.chat.listConversations(user.id);
  }

  // 200 et non 201 : l'appel retrouve la conversation existante dans la
  // grande majorité des cas, il ne crée pas systématiquement.
  @HttpCode(HttpStatus.OK)
  @Post('direct')
  openDirect(@CurrentUser() user: SessionUser, @Body() dto: OpenDirectDto) {
    return this.chat.openDirect(user.id, dto.userId);
  }

  /** Résout la conversation d'une commande. */
  @Get('order/:orderId')
  async findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const chatId = await this.chat.getChatIdForOrder(orderId, user.id);
    return { chatId, unread: await this.chat.countUnread(chatId, user.id) };
  }

  @Get(':chatId/messages')
  listMessages(
    @Param('chatId') chatId: string,
    @CurrentUser() user: SessionUser,
    @Query() dto: ListMessagesDto,
  ) {
    return this.chat.listMessages(chatId, user.id, dto);
  }

  @Post(':chatId/messages')
  async sendMessage(
    @Param('chatId') chatId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.chat.sendMessage(chatId, user.id, dto);
    // Les participants connectés en WebSocket doivent le recevoir aussitôt.
    this.gateway.broadcastMessage(chatId, message);
    return message;
  }

  @Patch(':chatId/read')
  async markAsRead(
    @Param('chatId') chatId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return { count: await this.chat.markAsRead(chatId, user.id) };
  }
}
