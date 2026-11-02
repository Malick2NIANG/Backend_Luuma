import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Le motif est obligatoire : un profil rejeté sans explication laisse
 * l'utilisateur sans recours, et le commerçant comme le GP doivent savoir
 * quoi corriger pour repostuler.
 */
export class RejectDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif du rejet est obligatoire.' })
  @MaxLength(1000)
  rejectionNote!: string;
}

export class ApproveDto {
  /**
   * Confirme que la pièce d'identité a bien été consultée.
   * Distinct de l'approbation : un admin peut approuver un profil dont le
   * KYC reste à vérifier (utile en phase de lancement).
   *
   * `@IsBoolean` n'était pas là, et `@IsOptional` seul ne valide rien : la
   * chaîne "false" passait et devenait vraie par coercition, enregistrant
   * une vérification d'identité que personne n'avait faite. C'est précisément
   * le champ à ne pas laisser passer par accident.
   */
  @IsOptional()
  @IsBoolean({ message: 'markKycVerified doit être un booléen.' })
  markKycVerified?: boolean;
}

/**
 * Relèvement manuel du plafond d'un GP de confiance, au-delà de ce que la
 * progression automatique aurait accordé (voir common/gp-capacity.ts).
 */
export class SetGpCapacityDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'La capacité doit être un nombre.' })
  @Min(1, { message: 'La capacité doit être d\'au moins 1 kg.' })
  @Max(100, { message: 'Plafond maximal : 100 kg.' })
  maxWeightPerTrip!: number;
}

export class ListPendingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
