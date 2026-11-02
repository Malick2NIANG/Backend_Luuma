import { RoleType, StoryMediaType } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Fonds proposés pour une story texte — clés, pas valeurs CSS. */
export const STORY_BACKGROUNDS = [
  'primary',
  'accent',
  'gold',
  'night',
] as const;
export type StoryBackground = (typeof STORY_BACKGROUNDS)[number];

/**
 * La cohérence entre `mediaType` et les champs fournis est vérifiée dans
 * StoriesService : class-validator ne sait pas exprimer « mediaKey requis
 * sauf si TEXT, auquel cas c'est text qui l'est ».
 */
export class CreateStoryDto {
  /**
   * Sous quelle casquette publier. Un même compte pouvant être boutique et
   * GP, le choix ne peut pas se déduire — il se demande.
   */
  @IsIn([RoleType.MERCHANT, RoleType.GP], {
    message: 'Publiez en tant que commerçant ou GP.',
  })
  authorRole!: RoleType;

  @IsEnum(StoryMediaType, { message: 'Type de story invalide.' })
  mediaType!: StoryMediaType;

  /** Clé de stockage, catégorie `story`. Requise sauf pour une story texte. */
  @IsOptional()
  @IsString()
  mediaKey?: string;

  /** Contenu d'une story texte, ou légende d'une photo. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  text?: string;

  @IsOptional()
  @IsIn(STORY_BACKGROUNDS, { message: 'Fond invalide.' })
  background?: StoryBackground;

  /** Destination du glissement vers le haut. Les deux sont exclusives. */
  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  productId?: string;
}
