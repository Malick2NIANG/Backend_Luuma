import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { FollowDto } from './dto/follow.dto';
import { FollowsService } from './follows.service';

@UseGuards(AuthGuard)
@Controller('follows')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  // 200 et non le 201 par défaut de Nest : l'opération est un upsert
  // idempotent, réappuyer sur « suivre » ne crée rien de nouveau.
  @HttpCode(HttpStatus.OK)
  @Post()
  follow(@CurrentUser() user: SessionUser, @Body() dto: FollowDto) {
    return this.follows.follow(user.id, dto);
  }

  @Delete()
  unfollow(@CurrentUser() user: SessionUser, @Body() dto: FollowDto) {
    return this.follows.unfollow(user.id, dto);
  }

  @Get()
  listFollowing(@CurrentUser() user: SessionUser) {
    return this.follows.listFollowing(user.id);
  }
}
