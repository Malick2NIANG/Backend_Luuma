import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { Request } from 'express';
import { auth } from '../../auth/auth.config';

/**
 * Authentification facultative.
 *
 * Laisse toujours passer, mais renseigne `request.user` quand une session
 * valide est présente. Indispensable au mode visiteur : le fil doit être
 * lisible sans compte, tout en affichant les abonnements de l'utilisateur
 * connecté sans exiger deux routes distinctes.
 *
 * Un token invalide ou expiré est traité comme une absence de token — un
 * visiteur ne doit jamais se voir refuser du contenu public.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (session) {
        request.user = session.user;
      }
    } catch {
      // Session illisible : on poursuit en visiteur.
    }

    return true;
  }
}
