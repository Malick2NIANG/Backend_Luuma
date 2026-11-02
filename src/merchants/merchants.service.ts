import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemStatus, Merchant, Prisma, RoleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { ListOwnProductsDto } from './dto/list-own-products.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

/**
 * Statuts qui représentent une vente réellement acquise.
 *
 * PENDING est exclu : la commande n'est pas payée, compter son montant dans
 * le chiffre d'affaires afficherait au commerçant un revenu qu'il n'a pas.
 * CANCELLED et REFUNDED le sont aussi, pour la même raison.
 */
const EARNED_ITEM_STATUSES: ItemStatus[] = [
  ItemStatus.PREPARING,
  ItemStatus.HANDED_TO_GP,
  ItemStatus.IN_TRANSIT,
  ItemStatus.DELIVERED,
];

/** Champs publics du commerçant — n'expose ni KYC ni coordonnées de paiement. */
const PUBLIC_MERCHANT_SELECT = {
  id: true,
  shopName: true,
  description: true,
  city: true,
  country: true,
  rating: true,
  totalReviews: true,
  createdAt: true,
  user: {
    select: {
      // `id` est nécessaire au bouton « Message » : une conversation se noue
      // entre comptes, pas entre profils de boutique.
      id: true,
      name: true,
      avatar: true,
    },
  },
} satisfies Prisma.MerchantSelect;

@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(userId: string, dto: CreateMerchantDto): Promise<Merchant> {
    const existing = await this.prisma.merchant.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException('Vous avez déjà une boutique.');
    }

    if (dto.idDocumentUrl) {
      await this.storage.assertOwnedUpload(dto.idDocumentUrl, userId, 'kyc');
    }

    // Le profil et l'attribution du rôle doivent être atomiques : un profil
    // sans rôle MERCHANT laisserait le compte dans un état incohérent.
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          userId,
          shopName: dto.shopName,
          description: dto.description,
          address: dto.address,
          city: dto.city ?? 'Dakar',
          country: dto.country?.toUpperCase() ?? 'SN',
          idDocumentUrl: dto.idDocumentUrl,
          payoutMethod: dto.payoutMethod,
          payoutAccount: dto.payoutAccount,
          // isApproved / isKycVerified restent à false : validation par un admin.
        },
      });

      await tx.userRole.upsert({
        where: { userId_role: { userId, role: RoleType.MERCHANT } },
        update: {},
        create: { userId, role: RoleType.MERCHANT },
      });

      return merchant;
    });
  }

  async findOwn(userId: string): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException("Vous n'avez pas encore de boutique.");
    }

    return merchant;
  }

  async updateOwn(userId: string, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException("Vous n'avez pas encore de boutique.");
    }

    if (dto.idDocumentUrl) {
      await this.storage.assertOwnedUpload(dto.idDocumentUrl, userId, 'kyc');
    }

    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        shopName: dto.shopName,
        description: dto.description,
        address: dto.address,
        city: dto.city,
        country: dto.country?.toUpperCase(),
        idDocumentUrl: dto.idDocumentUrl,
        payoutMethod: dto.payoutMethod,
        payoutAccount: dto.payoutAccount,
      },
    });
  }

  /**
   * Profil public + produits disponibles. Réservé aux boutiques approuvées.
   *
   * `viewerId` facultatif : la boutique se consulte sans compte, mais un
   * utilisateur connecté doit voir s'il est déjà abonné.
   */
  async findById(id: string, viewerId?: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      select: {
        ...PUBLIC_MERCHANT_SELECT,
        isApproved: true,
        _count: { select: { followers: true } },
        products: {
          where: { isAvailable: true },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            priceEur: true,
            weight: true,
            images: true,
            category: true,
            createdAt: true,
          },
        },
      },
    });

    if (!merchant || !merchant.isApproved) {
      // Même réponse qu'une boutique inexistante : ne pas révéler l'existence
      // d'un profil en attente de validation.
      throw new NotFoundException('Boutique introuvable.');
    }

    const isFollowedByMe = viewerId
      ? (await this.prisma.follow.count({
          where: { followerId: viewerId, merchantId: id },
        })) > 0
      : false;

    const { isApproved: _isApproved, _count, ...publicMerchant } = merchant;
    return {
      ...publicMerchant,
      followersCount: _count.followers,
      isFollowedByMe,
    };
  }

  async list(dto: ListMerchantsDto) {
    const { city, q, page, limit } = dto;

    const where: Prisma.MerchantWhereInput = {
      isApproved: true,
      ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      ...(q ? { shopName: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.merchant.count({ where }),
      this.prisma.merchant.findMany({
        where,
        select: PUBLIC_MERCHANT_SELECT,
        orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Le catalogue tel que le commerçant le voit — indisponibles compris.
   *
   * Distinct de `findById`, qui filtre sur `isAvailable` et exige une boutique
   * approuvée. Ici on montre tout : un produit retiré de la vente doit rester
   * visible de son auteur, sinon « où est passé mon produit ? » n'a aucune
   * réponse dans l'interface.
   */
  async listOwnProducts(userId: string, dto: ListOwnProductsDto) {
    const merchant = await this.getOwnMerchantOrThrow(
      userId,
      'consulter votre catalogue',
    );
    const { availability, page, limit } = dto;

    const where: Prisma.ProductWhereInput = {
      merchantId: merchant.id,
      ...(availability === 'all'
        ? {}
        : { isAvailable: availability === 'available' }),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          name: true,
          price: true,
          priceEur: true,
          weight: true,
          images: true,
          category: true,
          subCategory: true,
          isAvailable: true,
          viewCount: true,
          unitLabel: true,
          minQuantity: true,
          productionDays: true,
          createdAt: true,
          // De quoi afficher « 3 tailles · 2 couleurs » sans charger les
          // déclinaisons entières dans une liste.
          _count: { select: { variants: true } },
          variants: {
            select: { id: true, stock: true },
          },
        },
      }),
    ]);

    return {
      data: data.map(({ _count, variants, ...product }) => ({
        ...product,
        variantCount: _count.variants,
        // Un produit décliné dont toutes les variantes sont à zéro est en
        // rupture, même si `isAvailable` reste vrai. Le calcul est fait ici
        // parce que la règle doit être la même partout.
        //
        // `stock === null` signifie « non suivi » — le cas de l'artisan qui
        // refait à la demande. Une seule variante non suivie suffit donc à ce
        // que le produit ne soit PAS en rupture : l'annoncer indisponible
        // ferait perdre des ventes à quelqu'un qui peut toujours produire.
        isOutOfStock:
          variants.length > 0 &&
          variants.every((v) => v.stock !== null && v.stock <= 0),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Chiffres de l'espace commerçant.
   *
   * Volontairement peu nombreux : quatre indicateurs qu'on lit d'un coup
   * valent mieux qu'un tableau de bord qu'on ne regarde plus.
   */
  async getOwnStats(userId: string) {
    const merchant = await this.getOwnMerchantOrThrow(
      userId,
      'consulter vos statistiques de vente',
    );

    const [productCount, availableCount, followersCount, toPrepare, earned] =
      await this.prisma.$transaction([
        this.prisma.product.count({ where: { merchantId: merchant.id } }),
        this.prisma.product.count({
          where: { merchantId: merchant.id, isAvailable: true },
        }),
        this.prisma.follow.count({ where: { merchantId: merchant.id } }),
        // Ce qui attend une action du commerçant : payé, pas encore remis.
        this.prisma.orderItem.count({
          where: {
            merchantId: merchant.id,
            status: { in: [ItemStatus.PENDING, ItemStatus.PREPARING] },
            order: { status: { not: 'PENDING' } },
          },
        }),
        this.prisma.orderItem.aggregate({
          where: {
            merchantId: merchant.id,
            status: { in: EARNED_ITEM_STATUSES },
          },
          _sum: { unitPrice: true },
          _count: true,
        }),
      ]);

    return {
      productCount,
      availableCount,
      followersCount,
      /** Articles payés en attente de préparation ou de remise au GP. */
      toPrepareCount: toPrepare,
      soldCount: earned._count,
      /**
       * Somme des prix unitaires en EUR, hors quantité.
       *
       * C'est un ORDRE DE GRANDEUR, pas une comptabilité : la quantité n'est
       * pas prise en compte, et rien ici ne tient compte de la commission ni
       * des remboursements partiels. Le vrai décompte viendra avec le module
       * de paiement — mieux vaut un chiffre annoncé comme indicatif qu'un
       * chiffre faux présenté comme un solde.
       */
      estimatedRevenueEur: earned._sum.unitPrice ?? 0,
      isApproved: merchant.isApproved,
    };
  }

  /**
   * La boutique de l'utilisateur, approuvée ou non.
   *
   * Utilisé par ProductsService pour l'écriture. Un dossier en attente peut
   * créer et modifier ses produits : ils restent invisibles du public, car le
   * fil, la recherche, la fiche produit et la commande filtrent tous sur
   * `merchant.isApproved`. Le commerçant prépare donc son catalogue pendant
   * l'examen, et sa boutique n'est pas vide le jour où elle ouvre.
   *
   * Un dossier REJETÉ est traité comme approuvé ici — il n'a rien de visible
   * non plus, et lui retirer l'accès à ses propres fiches ne protégerait rien.
   */
  async getOwnMerchantOrThrow(
    userId: string,
    /**
     * Ce que l'appelant cherchait à faire, pour que le refus le dise.
     *
     * Sans ce paramètre, une consultation de statistiques se voyait répondre
     * « vous devez créer une boutique avant de PUBLIER DES PRODUITS » — un
     * message écrit pour un autre appel, qui laisse croire à l'utilisateur
     * qu'il s'est trompé d'écran.
     */
    purpose = 'accéder à votre espace commerçant',
  ): Promise<Merchant> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new ForbiddenException(
        `Vous devez ouvrir une boutique pour ${purpose}.`,
      );
    }

    return merchant;
  }

  /**
   * La boutique, à condition qu'elle soit approuvée.
   *
   * Réservé aux actions qui SORTENT vers d'autres comptes — publier une story,
   * par exemple. Pour tout ce qui reste dans l'espace du commerçant, préférer
   * `getOwnMerchantOrThrow`.
   */
  async getApprovedMerchantOrThrow(userId: string): Promise<Merchant> {
    const merchant = await this.getOwnMerchantOrThrow(userId);

    if (!merchant.isApproved) {
      throw new ForbiddenException(
        "Votre boutique n'est pas encore approuvée par un administrateur.",
      );
    }

    return merchant;
  }
}
