import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  /** Obligatoire pour un produit décliné, interdit sinon. Vérifié en service. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  variantId?: string;

  /**
   * Décimale, car un tissu se commande en 2,5 mètres.
   *
   * `@IsInt` a donc dû sauter ici : l'exigence d'un entier ne vaut plus que
   * pour les articles qui se comptent à l'unité, et c'est le service qui la
   * fait respecter, une fois le `kind` du produit connu.
   */
  @Type(() => Number)
  @IsNumber({}, { message: 'Quantité invalide.' })
  @Min(0.01, { message: 'La quantité doit être supérieure à zéro.' })
  @Max(999, { message: '999 unités maximum par article.' })
  quantity!: number;

  /**
   * Mesures du client pour un article sur-mesure, en centimètres.
   *
   * Les clés attendues sont celles de `Product.requiredMeasurements`. Le
   * contrôle se fait en service, où le produit est connu — un DTO ne peut pas
   * valider un ensemble de clés qui dépend d'une autre ligne du payload.
   */
  @IsOptional()
  @IsObject({ message: 'Mesures invalides.' })
  measurements?: Record<string, number>;
}

/**
 * Le client choisit un trajet GP puis des produits — potentiellement chez
 * plusieurs commerçants. Le serveur regroupe ensuite les articles en un
 * colis par commerçant : chacun dépose son colis chez le même GP.
 *
 * Les montants ne sont jamais acceptés depuis le client : ils sont recalculés
 * à partir des prix en base au moment de la commande.
 */
export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Vous devez choisir un GP.' })
  tripId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Votre commande est vide.' })
  @ArrayMaxSize(50, { message: '50 articles maximum par commande.' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  @IsString()
  @IsNotEmpty({ message: "L'adresse de livraison est obligatoire." })
  @MaxLength(300)
  deliveryAddress!: string;

  @IsString()
  @IsNotEmpty({ message: 'La ville de livraison est obligatoire.' })
  @MaxLength(120)
  deliveryCity!: string;

  @IsString()
  @Length(2, 2, { message: 'Le pays doit être un code ISO à 2 lettres.' })
  deliveryCountry!: string;
}
