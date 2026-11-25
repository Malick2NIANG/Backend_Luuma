import { Injectable } from '@nestjs/common';
import { NotifType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { BELL_TYPES, NOTIF_CATEGORIES } from './notification-categories';

/** Client Prisma, ou transaction en cours : la notification suit l'événement. */
type Db = PrismaService | Prisma.TransactionClient;

export interface NewNotification {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  /** Route de l'application à ouvrir au toucher, et identifiants utiles. */
  data?: { lien?: string; [key: string]: unknown };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre des notifications.
   *
   * À appeler AVEC la transaction de l'événement (`tx`) : si l'opération
   * échoue et s'annule, la notification disparaît avec elle. Prévenir
   * quelqu'un d'un colis « remis au GP » qui ne l'a finalement pas été serait
   * pire que ne rien dire.
   *
   * Les doublons de destinataire sont fusionnés : un commerçant qui est aussi
   * le client de sa propre commande ne reçoit pas deux fois la même chose.
   */
  async notify(db: Db, entries: NewNotification[]): Promise<void> {
    const seen = new Set<string>();
    const unique = entries.filter((e) => {
      const key = `${e.userId}:${e.type}:${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) return;

    await db.notification.createMany({
      data: unique.map((e) => ({
        userId: e.userId,
        type: e.type,
        title: e.title,
        body: e.body,
        data: (e.data ?? {}) as Prisma.InputJsonValue,
      })),
    });
  }

  /**
   * Page de notifications, la plus récente d'abord.
   *
   * Pagination par curseur plutôt que par numéro de page : de nouvelles
   * notifications arrivent en tête pendant qu'on fait défiler, et un
   * décalage numérique ferait alors apparaître deux fois les mêmes lignes.
   */
  async list(userId: string, dto: ListNotificationsDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      type: {
        in: dto.categorie ? [...NOTIF_CATEGORIES[dto.categorie]] : BELL_TYPES,
      },
    };

    const q = dto.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: dto.limit + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        isRead: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > dto.limit;
    const items = hasMore ? rows.slice(0, dto.limit) : rows;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false, type: { in: BELL_TYPES } },
    });
    return { count };
  }

  /** Tout marquer lu, jusqu'à `jusqua` inclus s'il est fourni. */
  async markAllRead(userId: string, jusqua?: Date): Promise<{ count: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        ...(jusqua ? { createdAt: { lte: jusqua } } : {}),
      },
      data: { isRead: true },
    });
    return { count };
  }

  // --- Événements -------------------------------------------------------------
  //
  // Un texte par destinataire : le client, le commerçant et le GP ne vivent
  // pas le même moment. « Votre colis est chez le GP » rassure le client ;
  // dit au commerçant, c'est « votre part est faite ».
  //
  // Chaque notification porte `data.lien`, la page à ouvrir au toucher : le
  // téléphone n'a pas à deviner où mène un « colis refusé ».

  /** Paiement confirmé : le client est rassuré, commerçants et GP se mettent au travail. */
  async paiementConfirme(db: Db, orderId: string): Promise<void> {
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        clientId: true,
        packages: {
          select: {
            weight: true,
            merchant: { select: { userId: true } },
            gp: { select: { userId: true } },
            trip: { select: { originCity: true, destCity: true } },
          },
        },
      },
    });
    const ref = reference(orderId);

    const entries: NewNotification[] = [
      {
        userId: order.clientId,
        type: NotifType.ORDER_CONFIRMED,
        title: 'Paiement confirmé',
        body: `Votre commande ${ref} est payée. Les commerçants préparent vos articles ; l'argent reste bloqué jusqu'à la livraison.`,
        data: { lien: `/orders/${orderId}`, orderId },
      },
    ];

    for (const pkg of order.packages) {
      entries.push({
        userId: pkg.merchant.userId,
        type: NotifType.ORDER_CONFIRMED,
        title: 'Nouvelle commande à préparer',
        body: `Commande ${ref} payée : préparez le colis et remettez-le au GP avant son départ.`,
        data: { lien: '/merchant/packages', orderId },
      });
    }

    const gp = order.packages[0];
    if (gp) {
      const kilos = order.packages.reduce((total, p) => total + p.weight, 0);
      entries.push({
        userId: gp.gp.userId,
        type: NotifType.ORDER_CONFIRMED,
        title: 'Nouveaux colis réservés',
        body: `${formatKg(kilos)} réservés sur votre trajet ${gp.trip.originCity} → ${gp.trip.destCity} (commande ${ref}).`,
        data: { lien: '/gp/packages', orderId },
      });
    }

    await this.notify(db, entries);
  }

  /** Le commerçant a remis le colis. */
  async colisDepose(db: Db, packageId: string): Promise<void> {
    const p = await parties(db, packageId);
    await this.notify(db, [
      {
        userId: p.clientId,
        type: NotifType.PACKAGE_HANDED_TO_GP,
        title: 'Colis en route vers le GP',
        body: `${p.boutique} a remis votre colis (commande ${p.ref}).`,
        data: { lien: `/orders/${p.orderId}`, orderId: p.orderId, packageId },
      },
      {
        userId: p.gpUserId,
        type: NotifType.PACKAGE_HANDED_TO_GP,
        title: 'Colis à réceptionner',
        body: `${p.boutique} vous a envoyé un colis pour la commande ${p.ref}. Photographiez-le à la réception.`,
        data: { lien: '/gp/packages', orderId: p.orderId, packageId },
      },
    ]);
  }

  /** Le GP a le colis en main. */
  async colisRecu(db: Db, packageId: string): Promise<void> {
    const p = await parties(db, packageId);
    await this.notify(db, [
      {
        userId: p.clientId,
        type: NotifType.PACKAGE_RECEIVED_BY_GP,
        title: 'Colis pris en charge',
        body: `Le GP a reçu le colis de ${p.boutique} (commande ${p.ref}). Il voyagera avec lui.`,
        data: { lien: `/orders/${p.orderId}`, orderId: p.orderId, packageId },
      },
      {
        userId: p.merchantUserId,
        type: NotifType.PACKAGE_RECEIVED_BY_GP,
        title: 'Votre colis est chez le GP',
        body: `Le GP a confirmé la réception du colis de la commande ${p.ref}.`,
        data: { lien: '/merchant/packages', orderId: p.orderId, packageId },
      },
    ]);
  }

  /** Le colis est remis au client ; `commandeTerminee` si c'était le dernier. */
  async colisLivre(
    db: Db,
    packageId: string,
    commandeTerminee: boolean,
  ): Promise<void> {
    const p = await parties(db, packageId);
    await this.notify(db, [
      {
        userId: p.clientId,
        type: NotifType.ORDER_DELIVERED,
        title: commandeTerminee ? 'Commande livrée' : 'Colis livré',
        body: commandeTerminee
          ? `Votre commande ${p.ref} est entièrement livrée. Pensez à laisser un avis.`
          : `Le colis de ${p.boutique} est livré. D'autres colis de la commande ${p.ref} sont encore en route.`,
        data: { lien: `/orders/${p.orderId}`, orderId: p.orderId, packageId },
      },
      {
        userId: p.merchantUserId,
        type: NotifType.ORDER_DELIVERED,
        title: 'Colis livré au client',
        body: `Le colis de la commande ${p.ref} a été remis au client.`,
        data: { lien: '/merchant/packages', orderId: p.orderId, packageId },
      },
    ]);
  }

  /** Le GP refuse le colis ; `rembourse` si un paiement avait eu lieu. */
  async colisRefuse(
    db: Db,
    packageId: string,
    motif: string,
    rembourse: boolean,
  ): Promise<void> {
    const p = await parties(db, packageId);
    await this.notify(db, [
      {
        userId: p.clientId,
        type: NotifType.PACKAGE_REFUSED,
        title: 'Un colis a été refusé',
        body: rembourse
          ? `Le GP n'a pas pu prendre le colis de ${p.boutique}. Ces articles vous sont remboursés ; le reste de la commande ${p.ref} continue.`
          : `Le GP n'a pas pu prendre le colis de ${p.boutique} (commande ${p.ref}).`,
        data: { lien: `/orders/${p.orderId}`, orderId: p.orderId, packageId },
      },
      {
        userId: p.merchantUserId,
        type: NotifType.PACKAGE_REFUSED,
        title: 'Colis refusé par le GP',
        body: `Commande ${p.ref} — motif : ${motif}`,
        data: { lien: '/merchant/packages', orderId: p.orderId, packageId },
      },
    ]);
  }

  /**
   * Le client annule. Seuls commerçants et GP sont prévenus — le client sait
   * ce qu'il vient de faire — et seulement si la commande était payée : avant,
   * personne n'avait encore été mis au travail.
   */
  async commandeAnnulee(
    db: Db,
    orderId: string,
    etaitPayee: boolean,
  ): Promise<void> {
    if (!etaitPayee) return;
    const order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        packages: {
          select: {
            merchant: { select: { userId: true } },
            gp: { select: { userId: true } },
          },
        },
      },
    });
    const ref = reference(orderId);

    await this.notify(db, [
      ...order.packages.map((pkg) => ({
        userId: pkg.merchant.userId,
        type: NotifType.ORDER_CANCELLED,
        title: 'Commande annulée',
        body: `Le client a annulé la commande ${ref}. Ne remettez pas le colis.`,
        data: { lien: '/merchant/packages', orderId },
      })),
      ...order.packages.slice(0, 1).map((pkg) => ({
        userId: pkg.gp.userId,
        type: NotifType.ORDER_CANCELLED,
        title: 'Réservation annulée',
        body: `La commande ${ref} est annulée : les kilos réservés sont libérés sur votre trajet.`,
        data: { lien: '/gp/packages', orderId },
      })),
    ]);
  }

  /** Décision sur un dossier commerçant ou GP. */
  async dossierDecide(
    db: Db,
    params: {
      userId: string;
      role: 'MERCHANT' | 'GP';
      approuve: boolean;
      motif?: string | null;
    },
  ): Promise<void> {
    const boutique = params.role === 'MERCHANT';
    const lien = boutique ? '/(app)/(tabs)/shop' : '/(app)/(tabs)/gp';

    await this.notify(db, [
      params.approuve
        ? {
            userId: params.userId,
            type: NotifType.KYC_APPROVED,
            title: boutique
              ? 'Votre boutique est validée'
              : 'Votre compte GP est validé',
            body: boutique
              ? 'Vous pouvez publier vos produits et recevoir des commandes.'
              : 'Vous pouvez publier vos trajets et transporter des colis.',
            data: { lien },
          }
        : {
            userId: params.userId,
            type: NotifType.KYC_REJECTED,
            title: boutique
              ? 'Dossier boutique à compléter'
              : 'Dossier GP à compléter',
            body: params.motif
              ? `Votre dossier n'a pas pu être validé : ${params.motif}`
              : "Votre dossier n'a pas pu être validé. Vérifiez vos informations et renvoyez-le.",
            data: { lien },
          },
    ]);
  }
}

// --- Aides ----------------------------------------------------------------------

/** Référence courte d'une commande, lisible à voix haute au téléphone. */
function reference(orderId: string): string {
  return `#${orderId.slice(-6).toUpperCase()}`;
}

function formatKg(kilos: number): string {
  const arrondi = Math.round(kilos * 10) / 10;
  return `${String(arrondi).replace('.', ',')} kg`;
}

/** Les trois personnes concernées par un colis. */
async function parties(db: Db, packageId: string) {
  const pkg = await db.package.findUniqueOrThrow({
    where: { id: packageId },
    select: {
      orderId: true,
      order: { select: { clientId: true } },
      merchant: { select: { userId: true, shopName: true } },
      gp: { select: { userId: true } },
    },
  });
  return {
    orderId: pkg.orderId,
    ref: reference(pkg.orderId),
    clientId: pkg.order.clientId,
    merchantUserId: pkg.merchant.userId,
    boutique: pkg.merchant.shopName,
    gpUserId: pkg.gp.userId,
  };
}
