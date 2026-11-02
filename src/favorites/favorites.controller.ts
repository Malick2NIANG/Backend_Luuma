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
import { FavoriteDto } from './dto/favorite.dto';
import { FavoritesService } from './favorites.service';

@UseGuards(AuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  // 200 plutôt que le 201 par défaut : l'opération est un upsert idempotent.
  @HttpCode(HttpStatus.OK)
  @Post()
  add(@CurrentUser() user: SessionUser, @Body() dto: FavoriteDto) {
    return this.favorites.add(user.id, dto);
  }

  @Delete()
  remove(@CurrentUser() user: SessionUser, @Body() dto: FavoriteDto) {
    return this.favorites.remove(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.favorites.list(user.id);
  }
}
