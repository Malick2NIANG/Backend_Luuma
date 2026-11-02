/**
 * Devises proposées à l'affichage.
 *
 * XOF est la devise de publication — c'est en francs CFA que le commerçant
 * fixe son prix. EUR est la devise de FACTURATION : c'est le montant réellement
 * débité, quelle que soit la devise affichée. Les trois autres sont purement
 * indicatives.
 */
export const DISPLAY_CURRENCIES = ['XOF', 'EUR', 'USD', 'GBP', 'CAD'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

/** Devises dont le taux doit être récupéré : ni XOF (arrimé) ni EUR (base). */
export const FLOATING_CURRENCIES = ['USD', 'GBP', 'CAD'] as const;

/**
 * Parité fixe franc CFA / euro.
 *
 * Convention monétaire, pas cotation de marché : 1 EUR = 655,957 XOF depuis
 * le passage à l'euro, et cette valeur ne varie pas. C'est ce qui permet
 * d'afficher un équivalent en euros exact et gratuit, sans interroger
 * personne — et pourquoi toute autre conversion passe d'abord par l'euro.
 */
export const XOF_PER_EUR = 655.957;

/**
 * Durée de validité d'un taux avant nouvelle récupération.
 *
 * Les banques centrales publient une fois par jour ouvré. 12 heures laisse
 * donc deux tentatives par jour : si la première échoue, la seconde rattrape
 * sans attendre le lendemain.
 */
export const RATE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Source des taux.
 *
 * Frankfurter agrège les taux de référence de banques centrales, sans clé
 * d'API ni quota. Le projet est open source : si le service public
 * disparaissait, on redéploie le sien en changeant cette seule URL.
 */
export const RATES_ENDPOINT = 'https://api.frankfurter.dev/v1/latest';
