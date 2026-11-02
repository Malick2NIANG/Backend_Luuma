import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FLOATING_CURRENCIES,
  RATES_ENDPOINT,
  RATE_TTL_MS,
  XOF_PER_EUR,
} from './currency.constants';

export interface RatesResponse {
  /** Toutes les conversions partent de l'euro. */
  base: 'EUR';
  /** Parité fixe, renvoyée pour que le client convertisse lui-même. */
  xofPerEur: number;
  /** Unités par euro, par devise flottante. */
  rates: Record<string, number>;
  /**
   * Date de la cotation, ou null si aucun taux n'a jamais pu être récupéré.
   * Le client l'affiche : « taux du 2 septembre ».
   */
  quotedAt: string | null;
  /**
   * Vrai quand les taux ont plus d'un jour — service injoignable, ou week-end.
   * L'interface le signale au lieu de présenter un taux périmé comme frais.
   */
  isStale: boolean;
}

interface FrankfurterPayload {
  date: string;
  base: string;
  rates: Record<string, number>;
}

/**
 * Taux de change, servis depuis notre base.
 *
 * L'application n'appelle jamais la source externe : c'est le serveur qui va
 * chercher les taux et les range. Trois raisons — le téléphone ne dépend
 * d'aucun tiers, aucune limite de débit ne s'applique quel que soit le nombre
 * d'utilisateurs, et le jour où la source tombe, les clients continuent de
 * voir les taux de la veille plutôt qu'un écran vide.
 *
 * Le rafraîchissement est PARESSEUX plutôt que planifié : la première requête
 * après péremption déclenche la récupération. Pas de processus de fond à
 * surveiller, pas de tâche qui meurt en silence — et sur un taux qui ne bouge
 * qu'une fois par jour, la différence est nulle pour l'utilisateur.
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  /** Empêche dix requêtes simultanées de lancer dix récupérations. */
  private refreshing: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getRates(): Promise<RatesResponse> {
    let rows = await this.prisma.exchangeRate.findMany();

    if (this.isExpired(rows)) {
      await this.refreshOnce();
      rows = await this.prisma.exchangeRate.findMany();
    }

    const quotedAt = rows.reduce<Date | null>(
      (latest, row) =>
        !latest || row.quotedAt > latest ? row.quotedAt : latest,
      null,
    );

    return {
      base: 'EUR',
      xofPerEur: XOF_PER_EUR,
      rates: Object.fromEntries(rows.map((r) => [r.currency, r.perEur])),
      quotedAt: quotedAt?.toISOString() ?? null,
      // Plus de 24 h : on est soit un lundi matin après un week-end sans
      // cotation, soit en panne de source. Dans les deux cas, on le dit.
      isStale:
        !quotedAt || Date.now() - quotedAt.getTime() > 24 * 60 * 60 * 1000,
    };
  }

  private isExpired(rows: { updatedAt: Date }[]): boolean {
    if (rows.length === 0) return true;
    const freshest = Math.max(...rows.map((r) => r.updatedAt.getTime()));
    return Date.now() - freshest > RATE_TTL_MS;
  }

  /** Déduplique les récupérations concurrentes. */
  private async refreshOnce(): Promise<void> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<void> {
    try {
      const url = `${RATES_ENDPOINT}?base=EUR&symbols=${FLOATING_CURRENCIES.join(',')}`;

      // Délai court et explicite : sans lui, une source qui ne répond pas
      // ferait attendre indéfiniment la requête d'un utilisateur qui voulait
      // seulement voir un prix.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Réponse ${response.status}`);
      }

      const payload = (await response.json()) as FrankfurterPayload;
      const quotedAt = new Date(payload.date);

      await this.prisma.$transaction(
        FLOATING_CURRENCIES.filter(
          (currency) => typeof payload.rates[currency] === 'number',
        ).map((currency) =>
          this.prisma.exchangeRate.upsert({
            where: { currency },
            update: { perEur: payload.rates[currency], quotedAt },
            create: { currency, perEur: payload.rates[currency], quotedAt },
          }),
        ),
      );

      this.logger.log(`Taux de change mis à jour (cotation du ${payload.date})`);
    } catch (error) {
      // Échec volontairement silencieux pour l'appelant : on sert les derniers
      // taux connus. Faire échouer l'affichage d'un prix parce qu'un service
      // tiers est indisponible serait disproportionné — l'équivalent en devise
      // est un confort, le prix en FCFA reste juste.
      this.logger.warn(
        `Récupération des taux impossible : ${String(error)}. Derniers taux conservés.`,
      );
    }
  }
}
