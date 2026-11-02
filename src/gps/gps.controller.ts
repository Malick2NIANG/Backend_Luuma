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
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { VerifiedEmailGuard } from '../common/guards/verified-email.guard';
import { CreateGpDto } from './dto/create-gp.dto';
import { UpdateGpDto } from './dto/update-gp.dto';
import { GpsService } from './gps.service';

@Controller('gps')
export class GpsController {
  constructor(private readonly gpsService: GpsService) {}

  // Un GP transporte les achats d'inconnus : email vérifié exigé.
  @UseGuards(AuthGuard, VerifiedEmailGuard)
  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateGpDto) {
    return this.gpsService.create(user.id, dto);
  }

  // Déclaré avant `:id` pour que "me" ne soit pas capturé comme un id.
  @UseGuards(AuthGuard)
  @Get('me')
  findOwn(@CurrentUser() user: SessionUser) {
    return this.gpsService.findOwn(user.id);
  }

  @UseGuards(AuthGuard)
  @Patch('me')
  updateOwn(@CurrentUser() user: SessionUser, @Body() dto: UpdateGpDto) {
    return this.gpsService.updateOwn(user.id, dto);
  }

  /** Les trajets du GP — à venir, en cours, terminés et annulés. */
  @UseGuards(AuthGuard)
  @Get('me/trips')
  listOwnTrips(@CurrentUser() user: SessionUser) {
    return this.gpsService.listOwnTrips(user.id);
  }

  @UseGuards(AuthGuard)
  @Get('me/stats')
  getOwnStats(@CurrentUser() user: SessionUser) {
    return this.gpsService.getOwnStats(user.id);
  }

  /** Annuaire public — l'onglet « GP » de la recherche. */
  @UseGuards(OptionalAuthGuard)
  @Get()
  list(
    @Query('q') q: string | undefined,
    @CurrentUser() viewer: SessionUser | undefined,
  ) {
    return this.gpsService.list({ q, viewerId: viewer?.id });
  }

  // Public, mais lit la session si elle existe : `isFollowedByMe` en dépend.
  @UseGuards(OptionalAuthGuard)
  @Get(':id')
  findById(
    @Param('id') id: string,
    @CurrentUser() viewer: SessionUser | undefined,
  ) {
    return this.gpsService.findById(id, viewer?.id);
  }
}
