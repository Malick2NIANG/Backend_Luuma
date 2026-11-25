import { Injectable, Logger } from '@nestjs/common';
import { ProductCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Profil d'intérêts d'un compte, déduit de ce qu'il FAIT — rien n'est demandé.
 *
 * Deux signaux, de poids différents :
 *   · un FAVORI dit « ceci me plaît » : signal fort (×3) ;
 *   · une RECHERCHE dit « je cherche ce genre de choses » : signal léger (×1).
 *
 * Les deux s'estompent avec le temps (demi-vie de 30 jours pour les favoris,
 * 7 pour les recherches) : on cherche des cadeaux de Tabaski une semaine, pas
 * toute l'année. Les boutiques suivies ne passent pas par les catégories :
 * elles remontent directement, voir le fil.
 */
export interface InterestProfile {
  /** Poids par catégorie, ramené entre 0 et 1 (1 = catégorie favorite). */
  categories: Map<ProductCategory, number>;
  /** Les catégories dominantes, de la plus forte à la plus faible. */
  top: ProductCategory[];
}

const EMPTY: InterestProfile = { categories: new Map(), top: [] };

const FAVORI_POIDS = 3;
const FAVORI_DEMI_VIE_JOURS = 30;
const FAVORI_FENETRE_JOURS = 120;

const RECHERCHE_POIDS = 1;
const RECHERCHE_DEMI_VIE_JOURS = 7;
/** Au-delà, les signaux de recherche sont supprimés. */
const RECHERCHE_RETENTION_JOURS = 30;
const RECHERCHE_MAX_PAR_COMPTE = 30;

/** Une catégorie sous ce seuil (relatif) n'est pas un intérêt, c'est du bruit. */
const SEUIL_TOP = 0.25;

const JOUR_MS = 24 * 60 * 60 * 1000;

function decroissance(
  date: Date,
  demiVieJours: number,
  maintenant: number,
): number {
  const ageJours = Math.max(0, (maintenant - date.getTime()) / JOUR_MS);
  return Math.pow(0.5, ageJours / demiVieJours);
}

@Injectable()
export class InterestsService {
  private readonly logger = new Logger(InterestsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async profileFor(userId: string): Promise<InterestProfile> {
    const maintenant = Date.now();
    const depuisFavoris = new Date(maintenant - FAVORI_FENETRE_JOURS * JOUR_MS);
    const depuisRecherches = new Date(
      maintenant - RECHERCHE_RETENTION_JOURS * JOUR_MS,
    );

    const [favoris, recherches] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId, createdAt: { gte: depuisFavoris } },
        select: { createdAt: true, product: { select: { category: true } } },
        take: 200,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.searchSignal.findMany({
        where: { userId, createdAt: { gte: depuisRecherches } },
        select: { createdAt: true, categories: true },
        take: RECHERCHE_MAX_PAR_COMPTE,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (favoris.length === 0 && recherches.length === 0) return EMPTY;

    const brut = new Map<ProductCategory, number>();
    const ajouter = (categorie: ProductCategory, valeur: number) =>
      brut.set(categorie, (brut.get(categorie) ?? 0) + valeur);

    for (const f of favoris) {
      ajouter(
        f.product.category,
        FAVORI_POIDS *
          decroissance(f.createdAt, FAVORI_DEMI_VIE_JOURS, maintenant),
      );
    }
    for (const r of recherches) {
      if (r.categories.length === 0) continue;
      // Une recherche qui ramène trois catégories ne vaut pas trois
      // recherches : son poids se partage entre elles.
      const part =
        (RECHERCHE_POIDS *
          decroissance(r.createdAt, RECHERCHE_DEMI_VIE_JOURS, maintenant)) /
        r.categories.length;
      for (const c of r.categories) ajouter(c, part);
    }

    const max = Math.max(...brut.values());
    if (max <= 0) return EMPTY;

    const categories = new Map(
      [...brut.entries()].map(([c, v]) => [c, v / max] as const),
    );
    const top = [...categories.entries()]
      .filter(([, v]) => v >= SEUIL_TOP)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);

    return { categories, top };
  }

  /**
   * Enregistre une recherche — sans jamais faire échouer la recherche.
   *
   * Appelée après coup et sans attente : la personne n'a pas à patienter pour
   * qu'on note ce qu'elle cherche, et une écriture ratée ne doit pas lui
   * coûter ses résultats.
   */
  recordSearch(
    userId: string,
    query: string | undefined,
    categories: ProductCategory[],
  ): void {
    const distinctes = [...new Set(categories)];
    if (distinctes.length === 0) return;

    void this.prisma.searchSignal
      .create({
        data: {
          userId,
          query: query?.slice(0, 80) || null,
          categories: distinctes,
        },
      })
      .then(() => this.purger(userId))
      .catch((error: unknown) =>
        this.logger.warn(
          `Signal de recherche non enregistré : ${String(error)}`,
        ),
      );
  }

  /** Ne garde que les signaux récents, et au plus 30 par compte. */
  private async purger(userId: string): Promise<void> {
    const limite = new Date(Date.now() - RECHERCHE_RETENTION_JOURS * JOUR_MS);
    const anciens = await this.prisma.searchSignal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: RECHERCHE_MAX_PAR_COMPTE,
      select: { id: true },
    });
    await this.prisma.searchSignal.deleteMany({
      where: {
        userId,
        OR: [
          { createdAt: { lt: limite } },
          { id: { in: anciens.map((a) => a.id) } },
        ],
      },
    });
  }
}
