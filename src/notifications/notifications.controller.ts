import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import {
  ListNotificationsDto,
  MarkReadDto,
} from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() dto: ListNotificationsDto) {
    return this.notifications.list(user.id, dto);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: SessionUser) {
    return this.notifications.unreadCount(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('read-all')
  markAllRead(@CurrentUser() user: SessionUser, @Body() dto: MarkReadDto) {
    return this.notifications.markAllRead(user.id, dto.jusqua);
  }
}
