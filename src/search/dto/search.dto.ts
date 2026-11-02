import { Type } from 'class-transformer';
import { ProductCategory } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SEARCH_SCOPES = ['products', 'merchants', 'gps'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const SORT_OPTIONS = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'rating',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

/** Paliers de poids du panneau de filtres, en kg. */
export const WEIGHT_BUCKETS = [0.5, 1, 3] as const;

export class SearchProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(ProductCategory, { message: 'Catégorie invalide.' })
  category?: ProductCategory;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  merchantId?: string;

  /** Bornes en XOF, comme `Product.price`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** Poids maximal en kg — il détermine le coût de transport. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  maxWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsIn(SORT_OPTIONS, { message: 'Tri invalide.' })
  sort: SortOption = 'relevance';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class SuggestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  q!: string;
}
