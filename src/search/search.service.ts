import { Injectable } from '@nestjs/common';
import { Prisma, ProductCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchProductsDto, SuggestDto } from './dto/search.dto';

/**
 * Plancher de proximité pour les suggestions.
 *
 * `word_similarity` et non `similarity` : sur des mots courts, `similarity`
 * ne sépare pas le vrai résultat du bruit. Mesuré sur les données réelles,
 * « bazan » contre « Ensemble bazin brodé » donne 0,13 en `similarity` — pour
 * un bruit de fond à 0,03 — mais 0,5 en `word_similarity`, contre un plancher
 * uniforme à 0,167. `word_similarity` compare la meilleure sous-chaîne plutôt
 * que la chaîne entière, ce qui convient à une saisie partielle.
 */
const SUGGESTION_FLOOR = 0.35;
const SUGGESTION_LIMIT = 6;

interface ProductSearchRow {
  id: string;
  rank: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recherche de produits.
   *
   * Deux temps : le classement par pertinence se fait en SQL brut — Prisma ne
   * sait ni interroger un `tsvector` ni appeler `ts_rank` — puis les entités
   * sont rechargées avec leurs relations. Une requête de plus, mais un typage
   * complet et pas de SQL à rallonge pour les jointures.
   */
  async searchProducts(dto: SearchProductsDto) {
    const skip = (dto.page - 1) * dto.limit;
    const term = dto.q?.trim();

    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      merchant: {
        isApproved: true,
        ...(dto.city
          ? { city: { equals: dto.city, mode: 'insensitive' } }
          : {}),
        ...(dto.minRating ? { rating: { gte: dto.minRating } } : {}),
      },
      ...(dto.merchantId ? { merchantId: dto.merchantId } : {}),
      ...(dto.category ? { category: dto.category } : {}),
      ...(dto.maxWeight ? { weight: { lte: dto.maxWeight } } : {}),
      ...(dto.minPrice !== undefined || dto.maxPrice !== undefined
        ? {
            price: {
              ...(dto.minPrice !== undefined ? { gte: dto.minPrice } : {}),
              ...(dto.maxPrice !== undefined ? { lte: dto.maxPrice } : {}),
            },
          }
        : {}),
    };

    // Sans terme de recherche, « pertinence » n'a pas de sens : on retombe sur
    // les nouveautés, comportement attendu d'un catalogue qu'on parcourt.
    if (!term) {
      return this.listProducts(where, dto, skip);
    }

    const matchedIds = await this.rankProductIds(term, dto);

    if (matchedIds.length === 0) {
      return { data: [], total: 0, page: dto.page, limit: dto.limit, totalPages: 0 };
    }

    const rankById = new Map(matchedIds.map((r, i) => [r.id, i]));

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({
        where: { ...where, id: { in: matchedIds.map((r) => r.id) } },
      }),
      this.prisma.product.findMany({
        where: { ...where, id: { in: matchedIds.map((r) => r.id) } },
        include: { merchant: { select: MERCHANT_SUMMARY } },
        ...this.orderBy(dto),
        skip,
        take: dto.limit,
      }),
    ]);

    // Le tri par pertinence vient du SQL : Prisma ne peut pas le reproduire,
    // on réapplique donc l'ordre après coup.
    const data =
      dto.sort === 'relevance'
        ? [...rows].sort(
            (a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0),
          )
        : rows;

    return {
      data,
      total,
      page: dto.page,
      limit: dto.limit,
      totalPages: Math.ceil(total / dto.limit),
    };
  }

  /**
   * Classement par pertinence.
   *
   * `websearch_to_tsquery` accepte la syntaxe que les gens tapent vraiment
   * — guillemets, `or`, `-mot` — sans lever d'erreur sur une saisie
   * approximative, contrairement à `to_tsquery`.
   *
   * L'union avec les trigrammes rattrape les fautes de frappe : « bazan » ne
   * produit aucun lexème exploitable, mais reste proche de « bazin ».
   */
  private async rankProductIds(
    term: string,
    dto: SearchProductsDto,
  ): Promise<ProductSearchRow[]> {
    // Plafond volontaire : au-delà, la pertinence n'a plus de sens et la
    // clause `IN` deviendrait coûteuse.
    const CANDIDATE_CAP = 500;

    return this.prisma.$queryRaw<ProductSearchRow[]>`
      SELECT id, rank FROM (
        SELECT p.id,
               ts_rank(p.search_vector, websearch_to_tsquery('luum_fr', ${term})) AS rank
        FROM products p
        WHERE p.search_vector @@ websearch_to_tsquery('luum_fr', ${term})

        UNION

        SELECT p.id,
               word_similarity(${term}, p.name) * 0.5 AS rank
        FROM products p
        WHERE word_similarity(${term}, p.name) > ${SUGGESTION_FLOOR}
      ) matches
      ORDER BY rank DESC
      LIMIT ${CANDIDATE_CAP}
    `;
  }

  private async listProducts(
    where: Prisma.ProductWhereInput,
    dto: SearchProductsDto,
    skip: number,
  ) {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { merchant: { select: MERCHANT_SUMMARY } },
        ...this.orderBy(dto),
        skip,
        take: dto.limit,
      }),
    ]);

    return {
      data,
      total,
      page: dto.page,
      limit: dto.limit,
      totalPages: Math.ceil(total / dto.limit),
    };
  }

  private orderBy(dto: SearchProductsDto): { orderBy: Prisma.ProductOrderByWithRelationInput } {
    switch (dto.sort) {
      case 'price_asc':
        return { orderBy: { price: 'asc' } };
      case 'price_desc':
        return { orderBy: { price: 'desc' } };
      case 'rating':
        return { orderBy: { merchant: { rating: 'desc' } } };
      case 'newest':
      case 'relevance':
      default:
        return { orderBy: { createdAt: 'desc' } };
    }
  }

  /**
   * Suggestions pendant la saisie.
   *
   * Trois sources : des termes de produits, des boutiques, des destinations de
   * GP. Volontairement peu nombreuses — une liste longue se lit moins vite
   * qu'on ne finit de taper.
   */
  async suggest(dto: SuggestDto) {
    const term = dto.q.trim();
    if (term.length < 2) {
      return { products: [], merchants: [], destinations: [] };
    }

    const [products, merchants, destinations] = await Promise.all([
      this.prisma.$queryRaw<{ name: string }[]>`
        SELECT p.name
        FROM products p
        JOIN merchants m ON m.id = p."merchantId"
        WHERE p."isAvailable" = true AND m."isApproved" = true
          AND word_similarity(${term}, p.name) > ${SUGGESTION_FLOOR}
        ORDER BY word_similarity(${term}, p.name) DESC
        LIMIT ${SUGGESTION_LIMIT}
      `,
      this.prisma.$queryRaw<{ id: string; shopName: string; city: string }[]>`
        SELECT m.id, m."shopName", m.city
        FROM merchants m
        WHERE m."isApproved" = true
          AND word_similarity(${term}, m."shopName") > ${SUGGESTION_FLOOR}
        ORDER BY word_similarity(${term}, m."shopName") DESC
        LIMIT 3
      `,
      this.prisma.$queryRaw<{ destCity: string; destCountry: string }[]>`
        SELECT DISTINCT t."destCity", t."destCountry"
        FROM trips t
        JOIN gps g ON g.id = t."gpId"
        WHERE t.status = 'UPCOMING' AND t."departureDate" >= NOW()
          AND g."isApproved" = true
          AND word_similarity(${term}, t."destCity") > ${SUGGESTION_FLOOR}
        LIMIT 3
      `,
    ]);

    return {
      products: products.map((p) => p.name),
      merchants,
      destinations,
    };
  }

  /** Recherche de boutiques, onglet dédié de l'écran Recherche. */
  async searchMerchants(term: string | undefined, limit = 20) {
    const q = term?.trim();

    if (!q) {
      return this.prisma.merchant.findMany({
        where: { isApproved: true },
        select: MERCHANT_CARD,
        orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      });
    }

    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM merchants
      WHERE "isApproved" = true
        AND (search_vector @@ websearch_to_tsquery('luum_fr', ${q})
             OR word_similarity(${q}, "shopName") > ${SUGGESTION_FLOOR})
      ORDER BY ts_rank(search_vector, websearch_to_tsquery('luum_fr', ${q})) DESC
      LIMIT ${limit}
    `;

    return this.prisma.merchant.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: MERCHANT_CARD,
    });
  }
}

const MERCHANT_SUMMARY = {
  id: true,
  shopName: true,
  city: true,
  country: true,
  rating: true,
  totalReviews: true,
} satisfies Prisma.MerchantSelect;

const MERCHANT_CARD = {
  ...MERCHANT_SUMMARY,
  description: true,
  user: { select: { name: true, avatar: true } },
  _count: { select: { followers: true, products: true } },
} satisfies Prisma.MerchantSelect;
