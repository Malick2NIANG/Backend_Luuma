import { Logger } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const logger = new Logger('Cors');

/**
 * Hôtes considérés comme « ma machine ou mon réseau local ».
 *
 * Les plages privées sont incluses parce qu'en développement le téléphone
 * charge l'application depuis l'IP LAN du PC, jamais depuis localhost — il
 * n'a pas de boucle locale vers lui. Cette IP change à chaque réseau
 * (partage de connexion, wifi du bureau, wifi de la maison).
 */
const PRIVATE_HOST = new RegExp(
  [
    '^localhost$',
    '^127\\.\\d+\\.\\d+\\.\\d+$',
    '^10\\.\\d+\\.\\d+\\.\\d+$',
    '^192\\.168\\.\\d+\\.\\d+$',
    // 172.16.0.0 – 172.31.255.255
    '^172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+$',
  ].join('|'),
);

function isPrivateOrigin(origin: string): boolean {
  try {
    return PRIVATE_HOST.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Politique CORS.
 *
 * Elle remplace une liste figée de quatre adresses codées en dur, qui
 * échouait de la pire façon possible : le navigateur bloquait la réponse, le
 * fil s'affichait « vide » au lieu d'« erreur », et rien n'apparaissait dans
 * la console. Il suffisait de changer le port de Metro ou de réseau wifi pour
 * que l'application semble n'avoir aucune donnée.
 *
 * En développement, on accepte donc toute origine locale ou privée, quel que
 * soit le port. En production, seule la liste explicite de FRONTEND_URL passe :
 * ouvrir un site public à n'importe quelle origine annulerait la protection.
 */
export function buildCorsOptions(nodeEnv: string | undefined): CorsOptions {
  const isProduction = nodeEnv === 'production';

  const allowList = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (isProduction && allowList.length === 0) {
    // Échouer bruyamment au démarrage plutôt que de laisser une production
    // sans aucune origine autorisée, où chaque appel serait refusé.
    throw new Error(
      'FRONTEND_URL est obligatoire en production : il définit les origines ' +
        'autorisées à appeler l\'API.',
    );
  }

  return {
    credentials: true,
    origin(origin, callback) {
      // Origine absente : requête hors navigateur — application mobile
      // native, curl, sonde de disponibilité. Il n'y a alors aucune page
      // tierce à protéger, le CORS ne s'applique pas.
      if (!origin) return callback(null, true);

      const normalized = origin.replace(/\/$/, '');

      if (allowList.includes(normalized)) return callback(null, true);
      if (!isProduction && isPrivateOrigin(normalized)) {
        return callback(null, true);
      }

      // Journalisé : sans trace, un refus CORS est invisible côté serveur et
      // se manifeste côté client par une donnée manquante, pas par une erreur.
      logger.warn(`Origine refusée par le CORS : ${origin}`);
      return callback(null, false);
    },
  };
}
