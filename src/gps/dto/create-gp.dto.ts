import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const GP_PAYOUT_METHODS = [
  'wave',
  'orange_money',
  'bank',
  'stripe',
] as const;
export type GpPayoutMethod = (typeof GP_PAYOUT_METHODS)[number];

/**
 * Champs volontairement absents : isApproved, isKycVerified, rejectionNote,
 * totalTrips, maxWeightPerTrip, rating, totalReviews.
 *
 * maxWeightPerTrip en particulier ne doit jamais venir du client : c'est le
 * plafond de confiance, il se gagne par les voyages honorés (voir
 * common/gp-capacity.ts).
 */
export class CreateGpDto {
  /**
   * Malgré son nom (figé par le schéma Prisma), ce champ contient une CLÉ de
   * stockage — `kyc/{userId}/{uuid}.jpg` — et non une URL.
   *
   * Les pièces d'identité sont dans le bucket privé : `presignUpload` n'y
   * renvoie aucune URL publique, seulement la clé. La validité de cette clé
   * (catégorie, propriété, existence) est contrôlée dans GpsService.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  idDocumentUrl?: string;

  @IsOptional()
  @IsIn(GP_PAYOUT_METHODS, {
    message: 'Méthode de paiement invalide (wave, orange_money, bank, stripe).',
  })
  payoutMethod?: GpPayoutMethod;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  payoutAccount?: string;
}
