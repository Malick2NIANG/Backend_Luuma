/**
 * Progression de capacité d'un GP.
 *
 * Un nouveau GP transporte la valeur marchande d'inconnus : lui confier
 * 30 kg dès son premier voyage exposerait la plateforme à une fraude simple
 * et coûteuse. La capacité s'ouvre donc avec les voyages honorés.
 *
 * Ces paliers sont un choix produit, pas une contrainte technique — ils se
 * modifient ici seul. Aucun palier ne réduit jamais une capacité déjà
 * acquise (voir `resolveMaxWeightPerTrip`).
 */

interface CapacityTier {
  /** Nombre de voyages menés à terme requis pour atteindre ce palier. */
  minCompletedTrips: number;
  maxWeightKg: number;
}

const CAPACITY_TIERS: readonly CapacityTier[] = [
  { minCompletedTrips: 0, maxWeightKg: 5 }, // période d'essai
  { minCompletedTrips: 3, maxWeightKg: 10 },
  { minCompletedTrips: 5, maxWeightKg: 20 },
  { minCompletedTrips: 10, maxWeightKg: 30 },
] as const;

export function capacityForCompletedTrips(completedTrips: number): number {
  let capacity = CAPACITY_TIERS[0].maxWeightKg;
  for (const tier of CAPACITY_TIERS) {
    if (completedTrips >= tier.minCompletedTrips) {
      capacity = tier.maxWeightKg;
    }
  }
  return capacity;
}

/**
 * Capacité effective après un voyage terminé.
 *
 * Prend le maximum entre le palier calculé et la valeur actuelle : un admin
 * peut avoir relevé manuellement la limite d'un GP de confiance, et la
 * progression automatique ne doit pas la faire redescendre.
 */
export function resolveMaxWeightPerTrip(params: {
  completedTrips: number;
  currentMaxWeightPerTrip: number;
}): number {
  return Math.max(
    capacityForCompletedTrips(params.completedTrips),
    params.currentMaxWeightPerTrip,
  );
}
