import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAccessService } from '../../admin/admin-access.service';

/** Code renvoyé au client pour qu'il sache afficher l'écran de code. */
export const ADMIN_ELEVATION_REQUIRED = 'ADMIN_ELEVATION_REQUIRED';

/**
 * Troisième verrou des routes d'administration, après la session et le rôle.
 *
 * Il vérifie que CETTE session a validé un code reçu par email. C'est le seul
 * des trois qui résiste à une session volée : le jeton donne le compte et le
 * rôle, il ne donne pas la boîte mail.
 *
 * Posé sur le serveur, et pas seulement devant l'écran : masquer un bouton
 * n'empêche personne d'appeler `/api/admin/merchants/:id/approve` à la main.
 * Un contrôle qui vit uniquement dans l'interface ne contrôle rien.
 */
@Injectable()
export class AdminElevationGuard implements CanActivate {
  constructor(private readonly access: AdminAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.session?.id;

    if (!sessionId) {
      // AuthGuard n'est pas passé avant celui-ci : c'est une erreur de
      // câblage, pas un refus d'accès. Mieux vaut fermer.
      throw new ForbiddenException('Session introuvable.');
    }

    if (!(await this.access.isElevated(sessionId))) {
      throw new ForbiddenException({
        code: ADMIN_ELEVATION_REQUIRED,
        message:
          "Confirmez votre identité avec le code envoyé par email pour accéder à l'administration.",
      });
    }

    return true;
  }
}
