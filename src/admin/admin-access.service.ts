import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { OtpDeliveryService } from '../mail/otp-delivery.service';
import { PrismaService } from '../prisma/prisma.service';

/** Durée de vie du code envoyé par email. Court : il se saisit dans la foulée. */
const CODE_EXPIRY_MINUTES = 10;

/** Essais avant invalidation du code. Six chiffres, trois coups. */
const MAX_ATTEMPTS = 3;

/** Délai imposé entre deux demandes de code, pour la même session. */
const RESEND_COOLDOWN_MS = 60_000;

/** Coût bcrypt. 10 suffit pour un secret à 6 chiffres valable 10 minutes. */
const HASH_ROUNDS = 10;

export interface AdminAccessState {
  elevated: boolean;
  /** Fin de l'élévation, si elle est accordée. */
  expiresAt: string | null;
  /** Un code est en attente de saisie. */
  codePending: boolean;
  /** Secondes restantes avant de pouvoir redemander un code. */
  resendInSeconds: number;
}

/**
 * Double authentification à l'entrée de l'espace d'administration.
 *
 * Le rôle ADMIN dit QUI a le droit ; ce service dit si CETTE session-ci l'a
 * prouvé à l'instant. Les deux sont nécessaires parce qu'ils ne protègent pas
 * la même chose : le rôle résiste à un compte ordinaire qui tenterait une
 * route d'administration, l'élévation résiste à une session volée — jeton
 * recopié, navigateur laissé ouvert, poste partagé. Dans ce dernier cas le
 * mot de passe n'a pas été rejoué, donc rien d'autre ne s'y oppose.
 *
 * L'élévation vaut pour UNE session. Élever le compte élèverait du même coup
 * tous les appareils déjà connectés, y compris celui qu'on cherche à exclure.
 *
 * Durée : par défaut jusqu'à l'expiration de la session, réglable par
 * ADMIN_ELEVATION_TTL_MINUTES. Ce défaut est un choix assumé de confort ; il
 * protège du vol de mot de passe, pas d'un poste laissé ouvert. Resserrer la
 * variable ne demande aucun changement de code.
 */
@Injectable()
export class AdminAccessService {
  private readonly logger = new Logger(AdminAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpDeliveryService,
  ) {}

  /** Envoie un code à l'adresse du compte. Ne révèle jamais le code. */
  async requestCode(params: {
    userId: string;
    sessionId: string;
    email: string;
    name: string;
  }): Promise<{ sentTo: string; expiresInMinutes: number }> {
    const existing = await this.prisma.adminAccess.findUnique({
      where: { sessionId: params.sessionId },
    });

    // Le délai est porté par la ligne, donc par la session : deux appareils
    // n'ont pas à se gêner, et un seul ne peut pas noyer la boîte mail.
    if (existing?.codeExpiresAt) {
      const sentAt = existing.updatedAt.getTime();
      const waited = Date.now() - sentAt;
      if (waited < RESEND_COOLDOWN_MS) {
        const seconds = Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Un code vient d'être envoyé. Réessayez dans ${seconds} secondes.`,
            retryAfterSeconds: seconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // `randomInt` et non `Math.random` : le second est prévisible, et ce code
    // ouvre l'administration.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await hash(code, HASH_ROUNDS);
    const codeExpiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60_000);

    await this.prisma.adminAccess.upsert({
      where: { sessionId: params.sessionId },
      create: {
        userId: params.userId,
        sessionId: params.sessionId,
        codeHash,
        codeExpiresAt,
      },
      // Une nouvelle demande remet les compteurs à zéro ET retire l'élévation
      // en cours : demander un code, c'est recommencer la preuve.
      update: {
        codeHash,
        codeExpiresAt,
        attempts: 0,
        elevatedAt: null,
        expiresAt: null,
      },
    });

    await this.otp.send({
      channel: 'email',
      purpose: 'admin',
      code,
      email: params.email,
      name: params.name,
    });

    this.logger.log(
      `Code d'accès administration demandé pour ${params.userId} (session ${params.sessionId}).`,
    );

    return {
      sentTo: maskEmail(params.email),
      expiresInMinutes: CODE_EXPIRY_MINUTES,
    };
  }

  /** Valide le code et accorde l'élévation à cette session. */
  async verifyCode(params: {
    sessionId: string;
    sessionExpiresAt: Date;
    code: string;
  }): Promise<AdminAccessState> {
    const access = await this.prisma.adminAccess.findUnique({
      where: { sessionId: params.sessionId },
    });

    if (!access?.codeHash || !access.codeExpiresAt) {
      throw new ForbiddenException('Aucun code en attente. Demandez-en un.');
    }

    if (access.codeExpiresAt.getTime() < Date.now()) {
      await this.clearCode(params.sessionId);
      throw new ForbiddenException('Code expiré. Demandez-en un nouveau.');
    }

    if (access.attempts >= MAX_ATTEMPTS) {
      await this.clearCode(params.sessionId);
      throw new ForbiddenException('Trop d’essais. Demandez un nouveau code.');
    }

    const valid = await compare(params.code, access.codeHash);

    if (!valid) {
      const attempts = access.attempts + 1;
      await this.prisma.adminAccess.update({
        where: { sessionId: params.sessionId },
        data: { attempts },
      });
      const left = MAX_ATTEMPTS - attempts;
      throw new ForbiddenException(
        left > 0
          ? `Code incorrect. ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`
          : 'Code incorrect. Demandez un nouveau code.',
      );
    }

    const expiresAt = this.elevationExpiry(params.sessionExpiresAt);

    const updated = await this.prisma.adminAccess.update({
      where: { sessionId: params.sessionId },
      data: {
        // Le code est consommé : il ne doit pas pouvoir resservir, ni rester
        // en base une fois son office rempli.
        codeHash: null,
        codeExpiresAt: null,
        attempts: 0,
        elevatedAt: new Date(),
        expiresAt,
      },
    });

    return toState(updated);
  }

  /** Cette session a-t-elle le droit d'utiliser les routes d'administration ? */
  async isElevated(sessionId: string): Promise<boolean> {
    const access = await this.prisma.adminAccess.findUnique({
      where: { sessionId },
      select: { elevatedAt: true, expiresAt: true },
    });

    if (!access?.elevatedAt) return false;
    if (access.expiresAt && access.expiresAt.getTime() < Date.now()) {
      return false;
    }
    return true;
  }

  async getState(sessionId: string): Promise<AdminAccessState> {
    const access = await this.prisma.adminAccess.findUnique({
      where: { sessionId },
    });
    return access
      ? toState(access)
      : { elevated: false, expiresAt: null, codePending: false, resendInSeconds: 0 };
  }

  /** Referme l'accès sans toucher à la session : on quitte l'administration. */
  async revoke(sessionId: string): Promise<void> {
    await this.prisma.adminAccess.deleteMany({ where: { sessionId } });
  }

  private async clearCode(sessionId: string): Promise<void> {
    await this.prisma.adminAccess.update({
      where: { sessionId },
      data: { codeHash: null, codeExpiresAt: null, attempts: 0 },
    });
  }

  /**
   * L'élévation ne peut jamais survivre à la session qui la porte : le plafond
   * est l'expiration de celle-ci, quoi que dise la variable d'environnement.
   */
  private elevationExpiry(sessionExpiresAt: Date): Date {
    const configured = Number(process.env.ADMIN_ELEVATION_TTL_MINUTES);
    if (Number.isFinite(configured) && configured > 0) {
      const ttl = new Date(Date.now() + configured * 60_000);
      return ttl < sessionExpiresAt ? ttl : sessionExpiresAt;
    }
    return sessionExpiresAt;
  }
}

function toState(access: {
  elevatedAt: Date | null;
  expiresAt: Date | null;
  codeHash: string | null;
  codeExpiresAt: Date | null;
  updatedAt: Date;
}): AdminAccessState {
  const elevated =
    Boolean(access.elevatedAt) &&
    (!access.expiresAt || access.expiresAt.getTime() > Date.now());

  const codePending =
    Boolean(access.codeHash) &&
    Boolean(access.codeExpiresAt && access.codeExpiresAt.getTime() > Date.now());

  const waited = Date.now() - access.updatedAt.getTime();
  const resendInSeconds =
    codePending && waited < RESEND_COOLDOWN_MS
      ? Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000)
      : 0;

  return {
    elevated,
    expiresAt: elevated && access.expiresAt ? access.expiresAt.toISOString() : null,
    codePending,
    resendInSeconds,
  };
}

/**
 * `n****6@gmail.com` — de quoi reconnaître son adresse, pas de quoi
 * l'apprendre. L'écran affiche où le code est parti ; quelqu'un qui aurait
 * pris la session ne doit pas y découvrir l'adresse à attaquer ensuite.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return `***@${domain ?? ''}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.at(-1)}@${domain}`;
}
