import { NotifType } from '@prisma/client';

/**
 * Familles de notifications, pour les filtres du panneau.
 *
 * Les messages n'y figurent pas : ils ont leur onglet et son propre badge.
 * Les compter aussi dans la cloche gonflerait les deux chiffres sans rien
 * apprendre de plus.
 */
export const NOTIF_CATEGORIES = {
  COMMANDES: [
    NotifType.ORDER_CONFIRMED,
    NotifType.ORDER_DELIVERED,
    NotifType.PAYMENT_RELEASED,
    NotifType.ORDER_CANCELLED,
  ],
  COLIS: [
    NotifType.PACKAGE_HANDED_TO_GP,
    NotifType.PACKAGE_RECEIVED_BY_GP,
    NotifType.GP_IN_TRANSIT,
    NotifType.PACKAGE_REFUSED,
    NotifType.GP_CANCELLED_TRIP,
  ],
  COMPTE: [
    NotifType.KYC_APPROVED,
    NotifType.KYC_REJECTED,
    NotifType.DISPUTE_OPENED,
    NotifType.DISPUTE_RESOLVED,
  ],
} as const satisfies Record<string, readonly NotifType[]>;

export type NotifCategory = keyof typeof NOTIF_CATEGORIES;

/** Tous les types affichés dans la cloche (tout sauf les messages). */
export const BELL_TYPES: NotifType[] = Object.values(NOTIF_CATEGORIES).flat();
