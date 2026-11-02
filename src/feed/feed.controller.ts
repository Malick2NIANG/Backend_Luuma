import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { FeedQueryDto } from './dto/feed-query.dto';
import { FeedService } from './feed.service';

/**
 * Public. Un visiteur voit tout le fil ; un utilisateur connecté y retrouve
 * en plus l'état de ses abonnements sur chaque carte.
 */
@UseGuards(OptionalAuthGuard)
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  getFeed(
    @Query() dto: FeedQueryDto,
    @CurrentUser() user: SessionUser | undefined,
  ) {
    return this.feed.getFeed(dto, user?.id);
  }
}
