import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';

/** Chemin surveillé, relatif au contrôleur `api/auth`. */
const GUARDED_PATH = '/email-otp/send-verification-otp';

/** Nombre d'envois autorisés par adresse et par fenêtre. */
const MAX_SENDS = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 heure
/** Délai minimal entre deux envois. */
const COOLDOWN_MS = 60 * 1000;

interface SendHistory {
  /** Horodatages des envois encore dans la fenêtre. */
  timestamps: number[];
}

/**
 * Limite les demandes de code à usage unique.
 *
 * better-auth limite déjà les TENTATIVES de saisie (3 essais puis le code est
 * invalidé), mais rien n'empêche de redemander un code en boucle. Or le
 * destinataire n'est pas forcément celui qui appuie : « renvoyer le code »
 * devient sinon un moyen d'inonder la boîte mail de quelqu'un d'autre, et de
 * consommer notre quota d'envoi au passage.
 *
 * La clé est l'ADRESSE visée, pas l'appelant. Limiter par IP protégerait notre
 * serveur mais pas la victime : il suffirait de changer de réseau. Limiter par
 * adresse protège la personne visée, qui est ce qui compte ici.
 *
 * ⚠️ Compteur EN MÉMOIRE : il repart à zéro au redémarrage et n'est pas
 * partagé entre plusieurs instances. Suffisant pour un serveur unique ; le
 * jour où l'application tournera en plusieurs exemplaires, il faudra le
 * déplacer en base ou dans un cache partagé.
 */
@Injectable()
export class OtpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(OtpRateLimitGuard.name);
  private readonly history = new Map<string, SendHistory>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Le contrôleur d'authentification est un attrape-tout : seule la route
    // d'envoi de code nous intéresse, tout le reste passe sans contrôle.
    if (!request.path.endsWith(GUARDED_PATH)) return true;

    const email = this.readEmail(request);
    if (!email) return true; // better-auth refusera lui-même la requête.

    const now = Date.now();
    const entry = this.history.get(email) ?? { timestamps: [] };

    // On ne garde que les envois encore dans la fenêtre glissante ; la carte
    // se vide donc d'elle-même au fil des appels, sans tâche de nettoyage.
    const recent = entry.timestamps.filter((t) => now - t < WINDOW_MS);

    const last = recent[recent.length - 1];
    if (last !== undefined && now - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      throw new HttpException(
        {
          message: `Patientez ${wait} seconde${wait > 1 ? 's' : ''} avant de redemander un code.`,
          retryAfterSeconds: wait,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (recent.length >= MAX_SENDS) {
      const oldest = recent[0];
      const wait = Math.ceil((WINDOW_MS - (now - oldest)) / 60000);
      this.logger.warn(`Quota d'envoi de code atteint pour ${email}.`);
      throw new HttpException(
        {
          message: `Trop de demandes. Réessayez dans ${wait} minute${wait > 1 ? 's' : ''}.`,
          retryAfterSeconds: wait * 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.history.set(email, { timestamps: recent });
    return true;
  }

  private readEmail(request: Request): string | null {
    const body = request.body as { email?: unknown } | undefined;
    if (typeof body?.email !== 'string') return null;

    const email = body.email.trim().toLowerCase();
    return email.length > 0 ? email : null;
  }
}
