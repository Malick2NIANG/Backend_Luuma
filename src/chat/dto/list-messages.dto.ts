import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

/**
 * Pagination par curseur plutôt que par offset : dans un fil de discussion
 * actif, un nouveau message décale toutes les pages et provoque des doublons
 * ou des trous en scroll infini. Le curseur est une date, il ne bouge pas.
 */
export class ListMessagesDto {
  /** Renvoie les messages antérieurs à cette date. */
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
