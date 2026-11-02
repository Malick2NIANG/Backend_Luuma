import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Applique le décorateur @Roles().
 *
 * À utiliser APRÈS AuthGuard — il s'appuie sur `request.user`, que ce dernier
 * renseigne : @UseGuards(AuthGuard, RolesGuard).
 *
 * Les rôles vivent dans la table user_roles, pas dans la session better-auth :
 * une promotion en ADMIN prend effet à la requête suivante, sans attendre
 * l'expiration d'une session de 30 jours.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RoleType[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Aucun rôle exigé : le contrôle d'authentification d'AuthGuard suffit.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentification requise.');
    }

    const match = await this.prisma.userRole.findFirst({
      where: { userId, role: { in: required } },
      select: { id: true },
    });

    if (!match) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour cette action.",
      );
    }

    return true;
  }
}
