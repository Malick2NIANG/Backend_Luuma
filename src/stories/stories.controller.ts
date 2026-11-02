import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { CreateStoryDto } from './dto/create-story.dto';
import { StoriesService } from './stories.service';

/**
 * Tout est protégé : une story n'est visible que de ses destinataires, il n'y
 * a donc pas de vue publique. C'est la seule partie du fil qui exige un compte.
 */
@UseGuards(AuthGuard)
@Controller('stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateStoryDto) {
    return this.stories.create(user.id, dto);
  }

  /** Le bandeau de l'accueil, regroupé par auteur. */
  @Get('feed')
  getFeed(@CurrentUser() user: SessionUser) {
    return this.stories.getFeedStories(user.id);
  }

  @Get('mine')
  getMine(@CurrentUser() user: SessionUser) {
    return this.stories.getMyStories(user.id);
  }

  @Get(':id/viewers')
  getViewers(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.stories.getViewers(id, user.id);
  }

  // 204 : marquer comme vu ne renvoie rien d'utile, et l'appel part souvent
  // en arrière-plan pendant la lecture.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':id/view')
  markViewed(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.stories.markViewed(id, user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.stories.remove(id, user.id);
  }
}
