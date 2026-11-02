import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FavoriteDto } from './dto/favorite.dto';

/**
 * Favoris produits.
 *
 * Volontairement limité aux produits : mettre une boutique en favori ferait
 * doublon avec l'abonnement, qui couvre déjà le besoin « je veux retrouver ce
 * vendeur » et va plus loin en notifiant ses nouveautés.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, dto: FavoriteDto) {
    // Le produit doit exister ET appartenir à une boutique approuvée : sinon
    // on pourrait épingler une fiche retirée, qui resterait ensuite affichée
    // en favori sans jamais être achetable.
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, merchant: { isApproved: true } },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }

    // Upsert : réappuyer sur le cœur ne doit pas produire d'erreur — sur
    // mobile, un double tap accidentel est la règle, pas l'exception.
    await this.prisma.favorite.upsert({
      where: { userId_productId: { userId, productId: dto.productId } },
      update: {},
      create: { userId, productId: dto.productId },
    });

    return { favorited: true, productId: dto.productId };
  }

  async remove(userId: string, dto: FavoriteDto) {
    await this.prisma.favorite.deleteMany({
      where: { userId, productId: dto.productId },
    });

    return { favorited: false, productId: dto.productId };
  }

  /**
   * Identifiants seuls, pour marquer les cœurs d'une liste déjà chargée.
   *
   * Un Set plutôt qu'un tableau : le fil teste l'appartenance une fois par
   * publication, et la recherche linéaire deviendrait sensible dès quelques
   * centaines de favoris.
   */
  async getFavoritedIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { productId: true },
    });

    return new Set(rows.map((r) => r.productId));
  }

  /** L'écran Favoris : les fiches complètes, les plus récentes d'abord. */
  async list(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            merchant: {
              select: {
                id: true,
                shopName: true,
                city: true,
                rating: true,
                totalReviews: true,
                user: { select: { avatar: true } },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      favoritedAt: row.createdAt.toISOString(),
      product: {
        id: row.product.id,
        name: row.product.name,
        description: row.product.description,
        price: row.product.price,
        priceEur: row.product.priceEur,
        weight: row.product.weight,
        images: row.product.images,
        category: row.product.category,
        subCategory: row.product.subCategory,
        // Un produit retiré reste visible en favori, mais grisé : le faire
        // disparaître sans explication laisserait croire à une perte de données.
        isAvailable: row.product.isAvailable,
      },
      merchant: {
        id: row.product.merchant.id,
        name: row.product.merchant.shopName,
        city: row.product.merchant.city,
        avatar: row.product.merchant.user.avatar,
        rating: row.product.merchant.rating,
        totalReviews: row.product.merchant.totalReviews,
      },
    }));
  }
}
