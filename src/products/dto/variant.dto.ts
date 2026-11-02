import { Type } from 'class-transformer';
import { ProductSize } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Une déclinaison achetable.
 *
 * `weight` est obligatoire et non optionnel : c'est tout l'intérêt du modèle.
 * Le laisser facultatif inviterait à le sauter, et un boubou en 3XL facturé au
 * poids du XS fait perdre de l'argent au GP à chaque envoi.
 */
export class CreateVariantDto {
  @IsOptional()
  @IsEnum(ProductSize, { message: 'Taille invalide.' })
  size?: ProductSize;

  /** Libellé affiché s'il diffère de l'énumération : « 42/44 ». */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sizeLabel?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  colorName?: string;

  /** Couleur de la pastille de sélection, au format « #RRGGBB ». */
  @IsOptional()
  @IsHexColor({ message: 'Couleur invalide : utilisez un code hexadécimal.' })
  colorHex?: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids doit être un nombre.' })
  @Min(0.001, { message: 'Le poids doit être supérieur à 0.' })
  weight!: number;

  /** Absent = le prix du produit s'applique. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix doit être un nombre.' })
  @Min(1, { message: 'Le prix doit être supérieur à 0.' })
  price?: number;

  /** Absent = stock non suivi, cas de l'artisan qui refait à la demande. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Le stock doit être un nombre entier.' })
  @Min(0, { message: 'Le stock ne peut pas être négatif.' })
  stock?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: '6 images maximum par déclinaison.' })
  @IsString({ each: true })
  images?: string[];
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sizeLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  colorName?: string;

  @IsOptional()
  @IsHexColor({ message: 'Couleur invalide : utilisez un code hexadécimal.' })
  colorHex?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
