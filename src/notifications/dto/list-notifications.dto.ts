import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  NOTIF_CATEGORIES,
  type NotifCategory,
} from '../notification-categories';

export class ListNotificationsDto {
  /** Identifiant de la dernière notification reçue : la page suivante part d'elle. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  /** Recherche dans le titre et le texte, sans tenir compte de la casse. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(Object.keys(NOTIF_CATEGORIES))
  categorie?: NotifCategory;
}

export class MarkReadDto {
  /**
   * Instant jusqu'auquel tout est marqué lu — la date de la plus récente
   * notification AFFICHÉE dans le panneau.
   *
   * Sans cette borne, « tout marquer lu » à la fermeture effacerait aussi une
   * notification arrivée pendant que le panneau était ouvert, et que la
   * personne n'a donc jamais vue.
   */
  @IsOptional()
  @Type(() => Date)
  jusqua?: Date;
}
