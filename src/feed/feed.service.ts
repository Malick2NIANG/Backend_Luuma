import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductCategory,
  ProductKind,
  TripStatus,
} from '@prisma/client';
import { FavoritesService } from '../favorites/favorites.service';
import { FollowsService, type FollowedIds } from '../follows/follows.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedQueryDto } from './dto/feed-query.dto';

/** Auteur d'une publication — commerçant ou GP, présentés de la même façon. */
export interface FeedAuthor {
  type: 'merchant' | 'gp';
  /** Identifiant du PROFIL (boutique ou GP) : sert au lien vers la page. */
  id: string;
  /**
   * Identifiant du COMPTE derrière le profil.
   *
   * Distinct de `id` et tout aussi nécessaire : une conversation se noue
   * entre comptes. Sans lui, le bouton « Message » d'une publication n'aurait
   * personne à qui écrire, et un commerçant qui est aussi GP se retrouverait
   * avec deux fils selon l'écran d'où l'on part.
   */
  userId: string;
  name: string;
  avatar: string | null;
  city: string | null;
  rating: number;
  totalReviews: number;
  followersCount: number;
  isFollowedByMe: boolean;
}

interface FeedItemBase {
  id: string;
  publishedAt: string;
  author: FeedAuthor;
}

export type FeedItem =
  | (FeedItemBase & {
      kind: 'product';
      product: {
        id: string;
        name: string;
        // Le fil doit savoir si un ajout direct au panier est possible : une
        // taille ou des mesures se choisissent sur la fiche, pas ici.
        kind: ProductKind;
        description: string | null;
        price: number;
        priceEur: number | null;
        weight: number;
        images: string[];
        category: ProductCategory;
        subCategory: string | null;
        isFavorited: boolean;
      };
    })
  | (FeedItemBase & {
      kind: 'trip';
      trip: {
        id: string;
        originCity: string;
        destCity: string;
        destCountry: string;
        departureDate: string;
        pricePerKg: number;
        maxWeight: number;
        usedWeight: number;
        remainingWeight: number;
      };
    });

/** Résultat d'une source du fil : ses éléments et l'existence d'une suite. */
interface FeedSource {
  items: FeedItem[];
  hasMore: boolean;
  /**
   * Date de la ligne la plus ancienne réellement LUE, avant tout filtrage.
   *
   * Nécessaire quand un tour est intégralement filtré : sans élément visible,
   * il n'existe aucune date d'où repartir, et le fil se déclarerait épuisé
   * alors qu'il reste de la matière.
   */
  oldestRawAt: string | null;
}

/**
 * Fil d'actualité public.
 *
 * Deux sources (produits et annonces GP) fusionnées en un flux unique trié
 * par date. Aucune authentification requise : un visiteur doit pouvoir juger
 * du contenu avant de créer un compte. Quand il est connecté, les comptes
 * qu'il suit remontent en tête.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly follows: FollowsService,
    private readonly favorites: FavoritesService,
  ) {}

  async getFeed(dto: FeedQueryDto, userId?: string) {
    // Abonnements et favoris chargés en une fois pour toute la page : les
    // relire par publication ferait une requête par carte affichée.
    const [followed, favorited] = await Promise.all([
      userId
        ? this.follows.getFollowedIds(userId)
        : Promise.resolve<FollowedIds>({ merchantIds: [], gpIds: [] }),
      userId
        ? this.favorites.getFavoritedIds(userId)
        : Promise.resolve(new Set<string>()),
    ]);

    const onlyFollowing = dto.scope === 'following';
    const wantsProducts = dto.scope !== 'trips';
    const wantsTrips = dto.scope !== 'products';

    // Un utilisateur sans abonnement sur le filtre « suivis » n'a rien à voir :
    // inutile d'interroger la base.
    const noFollows =
      onlyFollowing && followed.merchantIds.length === 0 && followed.gpIds.length === 0;

    const before = dto.before ? new Date(dto.before) : undefined;

    // Chaque source lit `limit + 1` : `limit` pour pouvoir remplir la page à
    // elle seule, plus un pour savoir qu'il reste de la matière. Lire
    // seulement `limit` par source ferait jeter le surplus AVANT la fusion,
    // rendant invisible le cas d'une source unique excédentaire — les
    // éléments écartés seraient alors définitivement perdus.
    const EMPTY: FeedSource = {
      items: [],
      hasMore: false,
      oldestRawAt: null,
    };

    const [products, trips] = await Promise.all([
      wantsProducts && !noFollows
        ? this.fetchProducts(dto, followed, favorited, onlyFollowing, before)
        : EMPTY,
      wantsTrips && !noFollows
        ? this.fetchTrips(dto, followed, onlyFollowing, before)
        : EMPTY,
    ]);

    const merged = [...products.items, ...trips.items].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    const page = merged.slice(0, dto.limit);

    // `hasMore` s'appuie sur les compteurs bruts de chaque source, pas sur la
    // longueur fusionnée : les trajets complets sont écartés après lecture,
    // donc une page peut être courte alors qu'il reste des éléments à servir.
    const hasMore =
      products.hasMore || trips.hasMore || merged.length > dto.limit;

    return {
      items: page,
      // Curseur temporel. Limite connue : deux publications partageant la
      // milliseconde exacte pourraient se chevaucher en frontière de page.
      // Un curseur composite (date, id) le corrigerait si le volume l'exige.
      nextCursor: this.resolveNextCursor(hasMore, page, [products, trips]),
    };
  }

  /**
   * Détermine d'où repartir au tour suivant.
   *
   * Cas courant : la dernière publication affichée. Mais si tout un tour a été
   * filtré (des trajets complets, par exemple), la page est vide et n'offre
   * aucune date — il faut alors repartir des lignes brutes.
   *
   * On retient dans ce cas la PLUS RÉCENTE des dates les plus anciennes lues
   * par chaque source. Prendre la plus ancienne sauterait les lignes que
   * l'autre source n'a pas encore atteintes. Cette date reste strictement
   * antérieure au curseur précédent, donc la pagination progresse toujours.
   */
  private resolveNextCursor(
    hasMore: boolean,
    page: FeedItem[],
    sources: FeedSource[],
  ): string | null {
    if (!hasMore) return null;

    if (page.length > 0) {
      return page[page.length - 1].publishedAt;
    }

    const deepest = sources
      .map((s) => s.oldestRawAt)
      .filter((at): at is string => at !== null);

    if (deepest.length === 0) return null;

    return deepest.reduce((a, b) =>
      new Date(a).getTime() > new Date(b).getTime() ? a : b,
    );
  }

  private async fetchProducts(
    dto: FeedQueryDto,
    followed: FollowedIds,
    favorited: Set<string>,
    onlyFollowing: boolean,
    before?: Date,
  ): Promise<FeedSource> {
    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      merchant: {
        isApproved: true,
        ...(dto.city ? { city: { equals: dto.city, mode: 'insensitive' } } : {}),
        ...(onlyFollowing ? { id: { in: followed.merchantIds } } : {}),
      },
      ...(before ? { createdAt: { lt: before } } : {}),
      ...(dto.q
        ? {
            OR: [
              { name: { contains: dto.q, mode: 'insensitive' } },
              { description: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: dto.limit + 1,
      include: {
        merchant: {
          select: {
            id: true,
            shopName: true,
            city: true,
            rating: true,
            totalReviews: true,
            user: { select: { id: true, avatar: true } },
            _count: { select: { followers: true } },
          },
        },
      },
    });

    const items: FeedItem[] = rows.map((row) => ({
      kind: 'product' as const,
      id: `product:${row.id}`,
      publishedAt: row.createdAt.toISOString(),
      author: {
        type: 'merchant' as const,
        id: row.merchant.id,
        userId: row.merchant.user.id,
        // Le nom affiché est celui de la boutique, pas du gérant.
        name: row.merchant.shopName,
        avatar: row.merchant.user.avatar,
        city: row.merchant.city,
        rating: row.merchant.rating,
        totalReviews: row.merchant.totalReviews,
        followersCount: row.merchant._count.followers,
        isFollowedByMe: followed.merchantIds.includes(row.merchant.id),
      },
      product: {
        id: row.id,
        name: row.name,
        kind: row.kind,
        description: row.description,
        price: row.price,
        priceEur: row.priceEur,
        weight: row.weight,
        images: row.images,
        category: row.category,
        subCategory: row.subCategory,
        isFavorited: favorited.has(row.id),
      },
    }));

    return {
      items,
      hasMore: rows.length > dto.limit,
      oldestRawAt: rows.at(-1)?.createdAt.toISOString() ?? null,
    };
  }

  private async fetchTrips(
    dto: FeedQueryDto,
    followed: FollowedIds,
    onlyFollowing: boolean,
    before?: Date,
  ): Promise<FeedSource> {
    const where: Prisma.TripWhereInput = {
      status: TripStatus.UPCOMING,
      // Un trajet déjà parti n'a plus rien à faire dans le fil.
      departureDate: { gte: new Date() },
      gp: {
        isApproved: true,
        ...(onlyFollowing ? { id: { in: followed.gpIds } } : {}),
      },
      ...(before ? { createdAt: { lt: before } } : {}),
      ...(dto.city
        ? {
            OR: [
              { destCity: { equals: dto.city, mode: 'insensitive' } },
              { originCity: { equals: dto.city, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(dto.q
        ? {
            OR: [
              { destCity: { contains: dto.q, mode: 'insensitive' } },
              { originCity: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.trip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: dto.limit + 1,
      include: {
        gp: {
          select: {
            id: true,
            rating: true,
            totalReviews: true,
            user: { select: { id: true, name: true, avatar: true } },
            _count: { select: { followers: true } },
          },
        },
      },
    });

    // Prisma ne comparant pas deux colonnes d'une même ligne dans un `where`,
    // les trajets complets sont écartés après lecture. `hasMore` se calcule
    // donc sur `rows` (avant filtrage) et non sur le résultat.
    const items: FeedItem[] = rows
      .filter((row) => row.maxWeight - row.usedWeight > 0)
      .map((row) => ({
        kind: 'trip' as const,
        id: `trip:${row.id}`,
        publishedAt: row.createdAt.toISOString(),
        author: {
          type: 'gp' as const,
          id: row.gp.id,
          userId: row.gp.user.id,
          name: row.gp.user.name,
          avatar: row.gp.user.avatar,
          city: row.originCity,
          rating: row.gp.rating,
          totalReviews: row.gp.totalReviews,
          followersCount: row.gp._count.followers,
          isFollowedByMe: followed.gpIds.includes(row.gp.id),
        },
        trip: {
          id: row.id,
          originCity: row.originCity,
          destCity: row.destCity,
          destCountry: row.destCountry,
          departureDate: row.departureDate.toISOString(),
          pricePerKg: row.pricePerKg,
          maxWeight: row.maxWeight,
          usedWeight: row.usedWeight,
          remainingWeight:
            Math.round((row.maxWeight - row.usedWeight) * 1000) / 1000,
        },
      }));

    return {
      items,
      hasMore: rows.length > dto.limit,
      oldestRawAt: rows.at(-1)?.createdAt.toISOString() ?? null,
    };
  }
}
