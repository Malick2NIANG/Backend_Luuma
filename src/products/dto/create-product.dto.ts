import { Type } from 'class-transformer';
import { ProductCategory, ProductKind } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateVariantDto } from './variant.dto';

/**
 * `priceEur` est absent volontairement : il est calculé côté serveur à partir
 * de `price` (XOF). L'accepter en entrée permettrait d'afficher un prix EUR
 * qui ne correspond pas au montant réellement facturé au commerçant.
 * `isAvailable` l'est aussi : géré via DELETE (retrait) et PATCH.
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du produit est obligatoire.' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /** Prix en XOF (FCFA). */
  @Type(() => Number)
  @IsNumber({}, { message: 'Le prix doit être un nombre.' })
  @Min(1, { message: 'Le prix doit être supérieur à 0.' })
  price!: number;

  /** Poids en kg — détermine la capacité GP consommée. */
  @Type(() => Number)
  @IsNumber({}, { message: 'Le poids doit être un nombre.' })
  @Min(0.01, { message: 'Le poids doit être supérieur à 0.' })
  weight!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: '10 images maximum par produit.' })
  @IsUrl({}, { each: true, message: 'Chaque image doit être une URL valide.' })
  images?: string[];

  /**
   * Liste fermée : c'est ce qui rend le filtre par catégorie possible.
   * En texte libre, « Vêtements », « habits » et « Vetement » cohabitaient.
   */
  @IsOptional()
  @IsEnum(ProductCategory, { message: 'Catégorie invalide.' })
  category?: ProductCategory;

  /** Précision libre : « boubou », « bazin homme »… Alimente la recherche. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  subCategory?: string;

  /**
   * Comment le produit se vend. Détermine ce qu'on demandera au client avant
   * l'ajout au panier : une taille, des mesures, une longueur, ou rien.
   */
  @IsOptional()
  @IsEnum(ProductKind, { message: 'Type de produit invalide.' })
  kind?: ProductKind;

  // --- BY_LENGTH ---
  /** « mètre », « yard ». Prix et poids du produit s'entendent alors par unité. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'La quantité minimale doit être un nombre.' })
  @Min(0.01)
  minQuantity?: number;

  // --- MADE_TO_ORDER ---
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Le délai de confection doit être un nombre de jours.' })
  @Min(1)
  @Max(365, { message: 'Un délai de plus d’un an n’est pas réaliste.' })
  productionDays?: number;

  /**
   * Clés stables des mesures exigées : « tour_poitrine », « tour_taille ».
   * Le libellé affiché est côté client — changer un libellé ne doit pas
   * invalider les mesures déjà enregistrées sur des commandes passées.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: '12 mesures maximum.' })
  @IsString({ each: true })
  requiredMeasurements?: string[];

  /**
   * Déclinaisons créées avec le produit.
   *
   * Optionnel même pour un `kind: VARIANT` : un commerçant enregistre souvent
   * la fiche d'abord et ajoute ses tailles ensuite. C'est la commande qui
   * refuse un produit décliné sans déclinaison choisie, pas la création.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60, { message: '60 déclinaisons maximum par produit.' })
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
