import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Product,
  ProductCategory,
  ProductKind,
} from '@prisma/client';
import { xofToEur } from '../common/currency';
import { MerchantsService } from '../merchants/merchants.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';

/** Résumé boutique joint aux produits — sans KYC ni coordonnées bancaires. */
const MERCHANT_SUMMARY_SELECT = {
  id: true,
  shopName: true,
  city: true,
  country: true,
  rating: true,
  totalReviews: true,
  // `user.id` sert au bouton « Message » de la fiche : une conversation se
  // noue entre comptes, pas entre boutiques. Sans lui, le bouton envoyait
  // l'identifiant de la boutique et n'aurait trouvé personne.
  user: { select: { id: true } },
} satisfies Prisma.MerchantSelect;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  async create(userId: string, dto: CreateProductDto) {
    const merchant = await this.merchants.getOwnMerchantOrThrow(userId);

    const kind = dto.kind ?? ProductKind.SIMPLE;
    this.assertKindIsCoherent(kind, dto);
    this.assertVariantsAreDistinct(dto.variants ?? []);

    return this.prisma.product.create({
      data: {
        merchantId: merchant.id,
        kind,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        // Calculé ici, jamais accepté depuis le client.
        priceEur: xofToEur(dto.price),
        weight: dto.weight,
        images: dto.images ?? [],
        // `AUTRE` par défaut plutôt que null : la colonne est non nullable, et
        // un produit sans catégorie reste trouvable via ce fourre-tout.
        category: dto.category ?? ProductCategory.AUTRE,
        subCategory: dto.subCategory,

        // Les champs propres à un type sont mis à null pour les autres : les
        // laisser traîner ferait qu'un produit basculé de BY_LENGTH à SIMPLE
        // garderait un « minimum 0,5 mètre » invisible mais actif.
        unitLabel: kind === ProductKind.BY_LENGTH ? dto.unitLabel : null,
        minQuantity: kind === ProductKind.BY_LENGTH ? dto.minQuantity : null,
        productionDays:
          kind === ProductKind.MADE_TO_ORDER ? dto.productionDays : null,
        requiredMeasurements:
          kind === ProductKind.MADE_TO_ORDER
            ? (dto.requiredMeasurements ?? [])
            : [],

        variants: dto.variants?.length
          ? { create: dto.variants.map((v) => ({ ...v })) }
          : undefined,
      },
      include: { variants: true },
    });
  }

  /**
   * Vérifie qu'un produit ne promet pas ce qu'il ne peut pas tenir.
   *
   * Ces contrôles n'existent pas dans le DTO parce qu'ils portent sur la
   * COMBINAISON des champs : un décorateur ne voit qu'une propriété à la fois,
   * et « `minQuantity` obligatoire seulement si le type est BY_LENGTH » ne
   * s'exprime pas ainsi.
   */
  private assertKindIsCoherent(kind: ProductKind, dto: CreateProductDto): void {
    if (kind === ProductKind.BY_LENGTH && !dto.unitLabel) {
      throw new BadRequestException(
        'Précisez l’unité de vente : « mètre », « yard »…',
      );
    }

    if (kind === ProductKind.MADE_TO_ORDER) {
      if (!dto.productionDays) {
        throw new BadRequestException(
          'Indiquez le délai de confection, en jours.',
        );
      }
      if (!dto.requiredMeasurements?.length) {
        throw new BadRequestException(
          'Indiquez au moins une mesure à demander au client.',
        );
      }
    }

    if (kind !== ProductKind.VARIANT && dto.variants?.length) {
      throw new BadRequestException(
        'Seul un produit décliné peut porter des tailles ou des couleurs.',
      );
    }
  }

  /**
   * Refuse deux déclinaisons identiques.
   *
   * La contrainte d'unicité en base ne suffit pas : Postgres considère deux
   * NULL comme distincts, donc deux variantes « bleu, sans taille » passeraient
   * sans broncher — et le client verrait deux pastilles identiques.
   */
  private assertVariantsAreDistinct(
    variants: { size?: string; colorName?: string }[],
  ): void {
    const seen = new Set<string>();

    for (const variant of variants) {
      const key = `${variant.size ?? ''}::${(variant.colorName ?? '').trim().toLowerCase()}`;

      if (seen.has(key)) {
        throw new BadRequestException(
          'Deux déclinaisons identiques : chaque combinaison taille + couleur doit être unique.',
        );
      }
      seen.add(key);
    }
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const merchant = await this.merchants.getOwnMerchantOrThrow(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }

    if (product.merchantId !== merchant.id) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits.',
      );
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        // Recalcule le prix EUR uniquement quand le prix XOF change.
        ...(dto.price !== undefined ? { priceEur: xofToEur(dto.price) } : {}),
        weight: dto.weight,
        images: dto.images,
        category: dto.category,
        subCategory: dto.subCategory,
        isAvailable: dto.isAvailable,
      },
    });
  }

  /**
   * Retrait logique : les OrderItem existants référencent ce produit, une
   * suppression physique casserait l'historique des commandes.
   */
  async remove(id: string, userId: string): Promise<Product> {
    const merchant = await this.merchants.getOwnMerchantOrThrow(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }

    if (product.merchantId !== merchant.id) {
      throw new ForbiddenException(
        'Vous ne pouvez retirer que vos propres produits.',
      );
    }

    return this.prisma.product.update({
      where: { id },
      data: { isAvailable: false },
    });
  }

  /** Le produit s'il appartient bien à la boutique de cet utilisateur. */
  private async getOwnProductOrThrow(productId: string, userId: string) {
    const merchant = await this.merchants.getOwnMerchantOrThrow(userId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true },
    });

    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }

    if (product.merchantId !== merchant.id) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres produits.',
      );
    }

    return product;
  }

  async addVariant(productId: string, userId: string, dto: CreateVariantDto) {
    const product = await this.getOwnProductOrThrow(productId, userId);

    if (product.kind !== ProductKind.VARIANT) {
      throw new BadRequestException('Ce produit ne se décline pas.');
    }

    // La nouvelle déclinaison est comparée aux existantes, pas seulement à
    // ses voisines du même appel.
    this.assertVariantsAreDistinct([
      ...product.variants.map((v) => ({
        size: v.size ?? undefined,
        colorName: v.colorName ?? undefined,
      })),
      { size: dto.size, colorName: dto.colorName },
    ]);

    return this.prisma.productVariant.create({
      data: { productId, ...dto },
    });
  }

  async updateVariant(variantId: string, userId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, productId: true },
    });

    if (!variant) {
      throw new NotFoundException('Déclinaison introuvable.');
    }

    await this.getOwnProductOrThrow(variant.productId, userId);

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
    });
  }

  /**
   * Retrait d'une déclinaison — logique, jamais physique.
   *
   * Un OrderItem peut la référencer : une suppression réelle casserait la
   * commande, et avec elle le bordereau du colis et l'historique du litige
   * éventuel. Même raisonnement que pour le retrait d'un produit.
   */
  async removeVariant(variantId: string, userId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, productId: true },
    });

    if (!variant) {
      throw new NotFoundException('Déclinaison introuvable.');
    }

    await this.getOwnProductOrThrow(variant.productId, userId);

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isAvailable: false },
    });
  }

  /**
   * @param viewerId Facultatif — la fiche se consulte sans compte, mais un
   * utilisateur connecté doit voir si le produit est déjà dans ses favoris.
   * Sans cela, le cœur s'affiche vide sur un produit déjà mis de côté.
   */
  async findById(id: string, viewerId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        merchant: { select: MERCHANT_SUMMARY_SELECT },
        // Seulement les déclinaisons encore proposées : une taille retirée
        // reste en base pour les commandes passées, mais n'a plus à s'afficher
        // comme un choix possible.
        variants: {
          where: { isAvailable: true },
          orderBy: [{ colorName: 'asc' }, { size: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produit introuvable.');
    }

    // Un produit retiré, ou dont la boutique n'est plus approuvée, ne doit
    // pas rester accessible publiquement via son id.
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: product.merchantId },
      select: { isApproved: true },
    });

    if (!product.isAvailable || !merchant?.isApproved) {
      throw new NotFoundException('Produit introuvable.');
    }

    const isFavorited = viewerId
      ? (await this.prisma.favorite.count({
          where: { userId: viewerId, productId: id },
        })) > 0
      : false;

    return { ...product, isFavorited };
  }
}
