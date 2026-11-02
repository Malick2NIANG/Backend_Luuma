import { ConflictException, Injectable } from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { TERMS_VERSION } from '../legal/legal.documents';
import { PrismaService } from '../prisma/prisma.service';

/**
 * État d'un profil professionnel.
 *
 * Quatre valeurs et non un booléen : « pas de boutique » et « boutique
 * refusée » demandent deux écrans différents, et les confondre reviendrait à
 * réinviter quelqu'un à s'inscrire alors qu'on vient de le refuser.
 */
export type ProfileState = 'none' | 'pending' | 'approved' | 'rejected';

export interface MeCapabilities {
  /** Payer une commande. */
  pay: boolean;
  /** Ouvrir une boutique — seulement si l'on n'en a pas déjà une. */
  openShop: boolean;
  /** Devenir GP. */
  becomeGp: boolean;
  /** Accéder à l'espace commerçant, même en attente de validation. */
  manageShop: boolean;
  /** Créer et modifier des produits. Invisibles tant que non approuvé. */
  publishProduct: boolean;
  /** Accéder à l'espace GP. */
  manageTrips: boolean;
  /** Publier un trajet. */
  publishTrip: boolean;
  /** Publier une story — exige un profil APPROUVÉ, c'est une vitrine. */
  publishStory: boolean;
  /** Accéder à l'écran d'administration. */
  administrate: boolean;
}

export interface MeLegalState {
  /** Version acceptée par ce compte. */
  acceptedVersion: string | null;
  acceptedAt: string | null;
  /** Version actuellement en vigueur. */
  currentVersion: string;
  /**
   * Les conditions ont changé depuis l'acceptation : il faut les faire
   * réaccepter. Calculé ici et non côté client, pour que la règle de
   * comparaison n'existe qu'à un seul endroit.
   */
  needsAcceptance: boolean;
  /** Accord pour les communications commerciales. */
  marketingConsent: boolean;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  emailVerified: boolean;
  roles: RoleType[];
  merchant: { id: string; shopName: string; state: ProfileState } | null;
  gp: { id: string; state: ProfileState } | null;
  can: MeCapabilities;
  legal: MeLegalState;
}

function stateOf(profile: {
  isApproved: boolean;
  rejectionNote: string | null;
} | null): ProfileState {
  if (!profile) return 'none';
  if (profile.isApproved) return 'approved';
  // Une note de refus n'est posée que par un administrateur qui rejette.
  return profile.rejectionNote ? 'rejected' : 'pending';
}

/**
 * Le point d'entrée unique « qui suis-je, et qu'ai-je le droit de faire ».
 *
 * Le client reçoit des CAPACITÉS déjà calculées, pas des rôles bruts. La
 * distinction n'est pas cosmétique : décider côté client qu'un commerçant peut
 * publier revient à recopier une règle qui vit dans les services, et les deux
 * finissent par diverger — le bouton reste actif, l'utilisateur récolte un 403
 * qu'il ne comprend pas. Ici, la seule question posée au serveur est
 * « can.publishProduct ? ».
 *
 * Une seule requête aussi : l'application interrogeait auparavant
 * `/merchants/me` et `/gps/me` en tolérant leurs 404, et ignorait purement et
 * simplement le rôle administrateur.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        emailVerified: true,
        termsAcceptedAt: true,
        termsVersion: true,
        marketingConsentAt: true,
        roles: { select: { role: true } },
        merchant: {
          select: {
            id: true,
            shopName: true,
            isApproved: true,
            rejectionNote: true,
          },
        },
        gp: { select: { id: true, isApproved: true, rejectionNote: true } },
      },
    });

    const merchantState = stateOf(user.merchant);
    const gpState = stateOf(user.gp);
    const roles = user.roles.map((r) => r.role);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      roles,
      merchant: user.merchant
        ? {
            id: user.merchant.id,
            shopName: user.merchant.shopName,
            state: merchantState,
          }
        : null,
      gp: user.gp ? { id: user.gp.id, state: gpState } : null,

      can: {
        // L'email vérifié ne garde que ce qui engage : l'argent et l'identité.
        pay: user.emailVerified,
        openShop: user.emailVerified && merchantState === 'none',
        becomeGp: user.emailVerified && gpState === 'none',

        // Un dossier en attente donne accès à l'espace pro et à la création de
        // produits : rien n'est visible du public tant que la boutique n'est
        // pas approuvée, donc le commerçant peut préparer son catalogue
        // pendant l'examen au lieu d'attendre les bras ballants.
        manageShop: merchantState === 'pending' || merchantState === 'approved',
        publishProduct:
          merchantState === 'pending' || merchantState === 'approved',
        manageTrips: gpState === 'pending' || gpState === 'approved',
        publishTrip: gpState === 'pending' || gpState === 'approved',

        // La story fait exception : c'est une vitrine poussée vers d'autres
        // comptes, elle exige donc un profil réellement validé.
        publishStory: merchantState === 'approved' || gpState === 'approved',

        administrate: roles.includes(RoleType.ADMIN),
      },

      legal: {
        acceptedVersion: user.termsVersion,
        acceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
        currentVersion: TERMS_VERSION,
        // Comparaison stricte plutôt qu'un ordre sur les versions : si la
        // version enregistrée n'est pas exactement celle en vigueur, on
        // redemande. Un compte créé avant la mise en place du dispositif
        // (`null`) est donc traité comme n'ayant rien accepté — ce qui est
        // exact.
        // DEUX conditions, et la seconde n'est pas redondante : `termsVersion`
        // peut être écrite sans que personne n'ait rien accepté, puisque
        // better-auth l'accepte comme champ d'inscription. Sans la date, on
        // aurait un compte réputé consentant dont on ne pourrait rien prouver
        // — exactement ce que le dispositif est censé éviter.
        needsAcceptance:
          user.termsVersion !== TERMS_VERSION || user.termsAcceptedAt === null,
        marketingConsent: user.marketingConsentAt !== null,
      },
    };
  }

  /**
   * Enregistre l'acceptation des conditions générales.
   *
   * L'horodatage est posé par le SERVEUR, jamais transmis par le client : une
   * date d'acceptation fournie par la partie qu'elle engage n'aurait aucune
   * valeur probante le jour d'un litige.
   *
   * La version, elle, vient du client mais est refusée si elle ne correspond
   * pas à celle en vigueur. Le cas se produit vraiment : une application
   * restée ouverte pendant une mise à jour des conditions enverrait l'ancienne
   * version, et on enregistrerait l'acceptation d'un texte que plus personne
   * ne lit.
   */
  async acceptTerms(
    userId: string,
    version: string,
    marketingConsent?: boolean,
  ) {
    if (version !== TERMS_VERSION) {
      throw new ConflictException(
        'Les conditions générales ont changé. Rechargez l’application pour lire la nouvelle version.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        // Absent = on ne touche pas à l'accord existant. Seul un booléen
        // explicite le modifie, dans un sens comme dans l'autre.
        ...(marketingConsent === undefined
          ? {}
          : { marketingConsentAt: marketingConsent ? new Date() : null }),
      },
    });

    return this.getProfile(userId);
  }

  /**
   * Enregistre ou retire l'accord commercial.
   *
   * Stocké comme une date et non un booléen : savoir QUAND l'accord a été
   * donné fait partie de ce qu'on doit pouvoir produire. Le retrait remet à
   * `null` — on perd la date de l'ancien accord, ce qui est acceptable ici
   * puisque c'est l'accord actif qui doit être justifié.
   */
  async setMarketingConsent(userId: string, accepted: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { marketingConsentAt: accepted ? new Date() : null },
      select: { marketingConsentAt: true },
    });

    return { marketingConsent: user.marketingConsentAt !== null };
  }
}
