import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const FEED_SCOPES = ['all', 'products', 'trips', 'following'] as const;
export type FeedScope = (typeof FEED_SCOPES)[number];

export class FeedQueryDto {
  @IsOptional()
  @IsIn(FEED_SCOPES, { message: 'Filtre de fil invalide.' })
  scope: FeedScope = 'all';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  q?: string;

  /** Ville du commerçant (produits) ou de destination (annonces GP). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  /**
   * Curseur : renvoie les publications antérieures à cette date. Une
   * pagination par offset produirait doublons et trous dès qu'un commerçant
   * publie pendant le défilement.
   */
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
