/**
 * Conversion XOF (FCFA) <-> EUR.
 *
 * Le franc CFA est arrimé à l'euro à un taux fixe (1 EUR = 655,957 XOF).
 * Ce n'est pas un taux de marché : il est fixé par convention monétaire,
 * donc aucune API externe n'est nécessaire. La valeur reste configurable
 * via EUR_TO_XOF_RATE au cas où la parité changerait un jour.
 */

const DEFAULT_EUR_TO_XOF_RATE = 655.957;

export function getEurToXofRate(): number {
  const raw = process.env.EUR_TO_XOF_RATE;
  if (!raw) return DEFAULT_EUR_TO_XOF_RATE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_EUR_TO_XOF_RATE;
  }
  return parsed;
}

/** Arrondit au centime — les montants EUR sont stockés en Float. */
export function xofToEur(amountXof: number): number {
  return Math.round((amountXof / getEurToXofRate()) * 100) / 100;
}

/** Le XOF n'a pas de subdivision en circulation : on arrondit au franc. */
export function eurToXof(amountEur: number): number {
  return Math.round(amountEur * getEurToXofRate());
}
