import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const PAYOUT_METHODS = ['wave', 'orange_money', 'bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/**
 * Champs volontairement absents : isApproved, isKycVerified, rejectionNote,
 * rating, totalReviews. Ce sont des champs système/admin — les exposer ici
 * permettrait à un commerçant de s'auto-approuver.
 */
export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la boutique est obligatoire.' })
  @MaxLength(120)
  shopName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty({ message: "L'adresse est obligatoire." })
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'Le pays doit être un code ISO à 2 lettres.' })
  country?: string;

  /**
   * Contient une CLÉ de stockage (`kyc/{userId}/{uuid}.jpg`), pas une URL —
   * le nom du champ vient du schéma Prisma. Validée dans MerchantsService :
   * un simple @IsString() laisserait déclarer la pièce d'identité d'autrui.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  idDocumentUrl?: string;

  @IsOptional()
  @IsIn(PAYOUT_METHODS, {
    message: 'Méthode de paiement invalide (wave, orange_money ou bank).',
  })
  payoutMethod?: PayoutMethod;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  payoutAccount?: string;
}
