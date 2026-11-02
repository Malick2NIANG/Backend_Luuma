import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Exige un email vérifié.
 *
 * À poser APRÈS AuthGuard, et uniquement sur les actions qui engagent
 * réellement : payer une commande, ouvrir une boutique, devenir GP.
 *
 * La vérification n'est volontairement pas exigée à l'inscription. Au Sénégal
 * l'email est un canal peu fiable — beaucoup ont une adresse qu'ils ne
 * consultent jamais, et la délivrabilité vers les fournisseurs locaux est
 * inégale. Un code qui n'arrive pas bloquerait alors l'accès à l'application
 * entière, y compris au simple fait de parcourir le catalogue. Ici, il ne
 * bloque que ce qui touche à l'argent et à l'identité.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Authentification requise.');
    }

    // Lecture en base plutôt que dans la session : un utilisateur qui vient de
    // saisir son code doit pouvoir enchaîner immédiatement, sans attendre le
    // renouvellement d'une session de 30 jours.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });

    if (!user?.emailVerified) {
      throw new ForbiddenException(
        'Vérifiez votre adresse email pour effectuer cette action.',
      );
    }

    return true;
  }
}
