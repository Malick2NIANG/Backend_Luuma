import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminAccessService } from './admin-access.service';
import { VerifyAdminCodeDto } from './dto/admin-access.dto';

/**
 * Obtention de l'élévation vers l'administration.
 *
 * Volontairement SÉPARÉ d'`AdminController` : ces routes sont celles qui
 * permettent d'obtenir le droit, elles ne peuvent donc pas l'exiger. Les
 * laisser dans le même contrôleur aurait imposé des exceptions au garde,
 * c'est-à-dire des trous ouverts à la main dans la protection.
 *
 * Le rôle ADMIN reste exigé : inutile d'envoyer un code à quelqu'un qui
 * n'aurait de toute façon accès à rien.
 */
@UseGuards(AuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin/access')
export class AdminAccessController {
  constructor(private readonly access: AdminAccessService) {}

  /** Où en est cette session : élevée, code en attente, ou rien. */
  @Get()
  getState(@Req() request: Request) {
    return this.access.getState(this.sessionId(request));
  }

  /** Envoie un code à l'adresse du compte. */
  @Post('request')
  requestCode(@Req() request: Request) {
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    return this.access.requestCode({
      userId: user.id,
      sessionId: this.sessionId(request),
      email: user.email,
      name: user.name,
    });
  }

  @Post('verify')
  verifyCode(@Req() request: Request, @Body() dto: VerifyAdminCodeDto) {
    const session = request.session;
    if (!session) throw new UnauthorizedException();

    return this.access.verifyCode({
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
      code: dto.code,
    });
  }

  /**
   * Quitter l'administration sans se déconnecter.
   *
   * Utile sur un poste partagé : on referme l'espace sensible et on reste
   * connecté à l'application ordinaire.
   */
  @Delete()
  async revoke(@Req() request: Request) {
    await this.access.revoke(this.sessionId(request));
    return { elevated: false };
  }

  private sessionId(request: Request): string {
    const id = request.session?.id;
    if (!id) throw new UnauthorizedException('Session introuvable.');
    return id;
  }
}
