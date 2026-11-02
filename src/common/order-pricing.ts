/**
 * Tarification des commandes Luuma.
 *
 * Trois composantes, toutes en EUR (devise de paiement du client) :
 *   - sous-total : somme des produits, convertis depuis le XOF
 *   - port       : poids total x prix/kg fixé par le GP
 *   - commission : pourcentage du sous-total, revenu de la plateforme
 *
 * La commission ne s'applique pas au port : celui-ci revient intégralement
 * au GP, la plateforme se rémunère sur la valeur marchande.
 */

const DEFAULT_PLATFORM_FEE_PERCENT = 6;

export function getPlatformFeePercent(): number {
  const raw = process.env.PLATFORM_FEE_PERCENT;
  if (!raw) return DEFAULT_PLATFORM_FEE_PERCENT;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return DEFAULT_PLATFORM_FEE_PERCENT;
  }
  return parsed;
}

/** Arrondi au centime — tous les montants EUR sont stockés en Float. */
export function roundEur(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface OrderTotals {
  subtotalEur: number;
  shippingEur: number;
  platformFeeEur: number;
  totalEur: number;
}

export function computeOrderTotals(params: {
  subtotalEur: number;
  totalWeightKg: number;
  pricePerKgEur: number;
}): OrderTotals {
  const subtotalEur = roundEur(params.subtotalEur);
  const shippingEur = roundEur(params.totalWeightKg * params.pricePerKgEur);
  const platformFeeEur = roundEur(
    subtotalEur * (getPlatformFeePercent() / 100),
  );

  return {
    subtotalEur,
    shippingEur,
    platformFeeEur,
    totalEur: roundEur(subtotalEur + shippingEur + platformFeeEur),
  };
}

/**
 * Remboursement d'un colis refusé par le GP.
 *
 * Le client récupère la valeur des articles, le port correspondant au poids
 * que le GP ne transporte finalement pas, et la part de commission associée.
 * Garder la commission sur une commande non honorée serait indéfendable.
 */
export function computePackageRefund(params: {
  packageSubtotalEur: number;
  packageWeightKg: number;
  pricePerKgEur: number;
}): number {
  const items = roundEur(params.packageSubtotalEur);
  const shipping = roundEur(params.packageWeightKg * params.pricePerKgEur);
  const fee = roundEur(items * (getPlatformFeePercent() / 100));

  return roundEur(items + shipping + fee);
}
