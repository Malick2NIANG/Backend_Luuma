import { BadRequestException } from '@nestjs/common';
import { ProductKind } from '@prisma/client';
import { OrderItemInputDto } from './dto/create-order.dto';

/** Produit tel que chargé par OrdersService, avec ses déclinaisons. */
export interface OrderableProduct {
  id: string;
  name: string;
  kind: ProductKind;
  price: number;
  priceEur: number | null;
  weight: number;
  unitLabel: string | null;
  minQuantity: number | null;
  productionDays: number | null;
  requiredMeasurements: string[];
  isAvailable: boolean;
  merchant: { id: string; isApproved: boolean };
  variants: {
    id: string;
    size: string | null;
    sizeLabel: string | null;
    colorName: string | null;
    weight: number;
    price: number | null;
    stock: number | null;
    isAvailable: boolean;
  }[];
}

/** Une ligne validée, prête à être chiffrée. */
export interface ResolvedLine {
  productId: string;
  variantId: string | null;
  merchantId: string;
  quantity: number;
  /** Prix unitaire en XOF, avant conversion. */
  unitPriceXof: number;
  /** Poids unitaire en kg — celui de la déclinaison si elle en a un. */
  unitWeight: number;
  variantLabel: string | null;
  measurements: Record<string, number> | null;
}

/**
 * Clé de regroupement des lignes du panier.
 *
 * Deux tailles d'un même produit sont DEUX lignes : les fusionner sur le seul
 * `productId` ferait disparaître le M au profit du L. Le sur-mesure n'est
 * jamais regroupé — deux exemplaires aux mesures différentes sont deux
 * articles, même vêtement ou pas.
 */
export function lineKey(item: OrderItemInputDto, index: number): string {
  if (item.measurements) return `custom:${index}`;
  return `${item.productId}::${item.variantId ?? ''}`;
}

/**
 * Applique les règles propres à chaque forme de produit.
 *
 * Regroupées ici plutôt que dispersées dans `create` : ce sont les règles
 * qu'un commerçant ou un client contestera un jour, et elles doivent être
 * lisibles d'un bloc.
 */
export function resolveLine(
  product: OrderableProduct,
  item: OrderItemInputDto,
  context: { departureDate: Date },
): ResolvedLine {
  const base = {
    productId: product.id,
    merchantId: product.merchant.id,
    quantity: item.quantity,
  };

  switch (product.kind) {
    case ProductKind.SIMPLE:
      assertWholeUnits(product, item.quantity);
      assertNoVariant(product, item);
      return {
        ...base,
        variantId: null,
        unitPriceXof: product.price,
        unitWeight: product.weight,
        variantLabel: null,
        measurements: null,
      };

    case ProductKind.VARIANT: {
      assertWholeUnits(product, item.quantity);

      if (!item.variantId) {
        throw new BadRequestException(
          `Choisissez une taille et une couleur pour « ${product.name} ».`,
        );
      }

      const variant = product.variants.find((v) => v.id === item.variantId);

      // Même message pour « n'appartient pas à ce produit » et « n'existe
      // pas » : distinguer les deux permettrait de sonder les identifiants.
      if (!variant) {
        throw new BadRequestException(
          `Ce choix n'est plus proposé pour « ${product.name} ».`,
        );
      }

      if (!variant.isAvailable) {
        throw new BadRequestException(
          `« ${product.name} » (${describeVariant(variant)}) n'est plus disponible.`,
        );
      }

      // `stock` nul = non suivi : l'artisan refait à la demande.
      if (variant.stock !== null && variant.stock < item.quantity) {
        throw new BadRequestException(
          variant.stock === 0
            ? `« ${product.name} » (${describeVariant(variant)}) est épuisé.`
            : `Il ne reste que ${variant.stock} exemplaire(s) de « ${product.name} » (${describeVariant(variant)}).`,
        );
      }

      return {
        ...base,
        variantId: variant.id,
        // La déclinaison peut redéfinir le prix ; la plupart ne le font pas.
        unitPriceXof: variant.price ?? product.price,
        // Mais elle porte TOUJOURS son propre poids : c'est lui qui sera
        // facturé par le GP et réservé sur la capacité du trajet.
        unitWeight: variant.weight,
        variantLabel: describeVariant(variant),
        measurements: null,
      };
    }

    case ProductKind.MADE_TO_ORDER: {
      assertWholeUnits(product, item.quantity);
      assertNoVariant(product, item);

      const measurements = item.measurements ?? {};
      const missing = product.requiredMeasurements.filter(
        (key) => typeof measurements[key] !== 'number' || measurements[key] <= 0,
      );

      if (missing.length > 0) {
        throw new BadRequestException(
          `Mesures manquantes pour « ${product.name} » : ${missing
            .map(humanizeMeasurement)
            .join(', ')}.`,
        );
      }

      // La règle qui compte vraiment : on ne confie pas un vêtement encore à
      // coudre à un GP qui part avant qu'il soit fini. Sans ce contrôle, le
      // client est débité, la capacité réservée, et le colis ne peut pas être
      // remis — c'est exactement le scénario que l'entiercement doit éviter.
      const days = product.productionDays ?? 0;
      const readyAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      if (readyAt > context.departureDate) {
        throw new BadRequestException(
          `« ${product.name} » demande ${days} jours de confection : ce GP part trop tôt. Choisissez un départ plus tardif.`,
        );
      }

      return {
        ...base,
        variantId: null,
        unitPriceXof: product.price,
        unitWeight: product.weight,
        variantLabel: 'Sur mesure',
        measurements,
      };
    }

    case ProductKind.BY_LENGTH: {
      assertNoVariant(product, item);

      const minimum = product.minQuantity ?? 0;
      if (item.quantity < minimum) {
        throw new BadRequestException(
          `Minimum ${minimum} ${product.unitLabel ?? 'unité'}(s) pour « ${product.name} ».`,
        );
      }

      return {
        ...base,
        variantId: null,
        // Prix et poids s'entendent PAR UNITÉ pour ce type : le produit
        // déclare « 4 000 FCFA et 180 g le mètre ».
        unitPriceXof: product.price,
        unitWeight: product.weight,
        variantLabel: `${item.quantity} ${product.unitLabel ?? 'unité'}(s)`,
        measurements: null,
      };
    }
  }
}

function assertWholeUnits(product: OrderableProduct, quantity: number): void {
  if (!Number.isInteger(quantity)) {
    throw new BadRequestException(
      `« ${product.name} » se commande à l'unité, pas en fractions.`,
    );
  }
}

function assertNoVariant(
  product: OrderableProduct,
  item: OrderItemInputDto,
): void {
  if (item.variantId) {
    throw new BadRequestException(
      `« ${product.name} » ne se décline pas.`,
    );
  }
}

/** « M · Bleu indigo » — ce qui sera figé sur la commande et la facture. */
export function describeVariant(variant: {
  size: string | null;
  sizeLabel: string | null;
  colorName: string | null;
}): string {
  // Le libellé libre l'emporte sur l'énumération : c'est celui que le
  // commerçant a choisi d'afficher (« 42/44 » plutôt que « L »).
  const size = variant.sizeLabel ?? variant.size;
  return [size, variant.colorName].filter(Boolean).join(' · ') || 'Standard';
}

/** `tour_poitrine` → `tour poitrine`, pour un message d'erreur lisible. */
function humanizeMeasurement(key: string): string {
  return key.replace(/_/g, ' ');
}
