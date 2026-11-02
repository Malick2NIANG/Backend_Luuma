import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatKind,
  ItemStatus,
  OrderStatus,
  PackageStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  TripStatus,
} from '@prisma/client';
import { xofToEur } from '../common/currency';
import { computeOrderTotals, roundEur } from '../common/order-pricing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, OrderItemInputDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { lineKey, resolveLine } from './order-lines';

/** Détail complet d'une commande, réutilisé par toutes les lectures. */
const ORDER_DETAIL_INCLUDE = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, images: true, weight: true },
      },
      merchant: { select: { id: true, shopName: true, city: true } },
    },
  },
  packages: {
    include: {
      merchant: { select: { id: true, shopName: true, city: true } },
    },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée une commande au statut PENDING.
   *
   * La capacité du GP n'est PAS réservée ici : elle ne l'est qu'à la
   * confirmation du paiement (voir `confirmPayment`). Un panier abandonné ne
   * doit jamais immobiliser des kilos sur un trajet réel.
   */
  async create(userId: string, dto: CreateOrderDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
    });

    if (!trip) {
      throw new NotFoundException('Trajet introuvable.');
    }

    if (trip.status !== TripStatus.UPCOMING) {
      throw new BadRequestException(
        "Ce trajet n'accepte plus de nouvelles commandes.",
      );
    }

    if (trip.departureDate.getTime() <= Date.now()) {
      throw new BadRequestException('Ce trajet est déjà parti.');
    }

    // Regroupe les lignes identiques du panier. La clé inclut la déclinaison :
    // le même boubou en M et en L ne doit pas fusionner, sans quoi l'une des
    // deux tailles disparaîtrait silencieusement de la commande.
    const merged = new Map<string, OrderItemInputDto>();
    dto.items.forEach((item, index) => {
      const key = lineKey(item, index);
      const existing = merged.get(key);
      if (existing) existing.quantity += item.quantity;
      else merged.set(key, { ...item });
    });

    const requested = [...merged.values()];
    const productIds = [...new Set(requested.map((i) => i.productId))];

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        merchant: { select: { id: true, isApproved: true } },
        variants: {
          select: {
            id: true,
            size: true,
            sizeLabel: true,
            colorName: true,
            weight: true,
            price: true,
            stock: true,
            isAvailable: true,
          },
        },
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        "Certains produits de votre commande n'existent plus.",
      );
    }

    const unavailable = products.filter(
      (p) => !p.isAvailable || !p.merchant.isApproved,
    );
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `Produit(s) indisponible(s) : ${unavailable.map((p) => p.name).join(', ')}.`,
      );
    }

    const productById = new Map(products.map((p) => [p.id, p]));

    // --- Poids et montants -------------------------------------------------
    let totalWeight = 0;
    let subtotalEur = 0;

    const lines = requested.map((item) => {
      const product = productById.get(item.productId)!;

      // Toutes les règles propres au type de produit — taille obligatoire,
      // stock, mesures, délai de confection, longueur minimale — sont
      // appliquées ici. Voir `order-lines.ts`.
      const resolved = resolveLine(product, item, {
        departureDate: trip.departureDate,
      });

      // priceEur est nullable en base : on retombe sur la conversion du prix
      // XOF plutôt que de propager un NaN silencieux dans les totaux. La
      // conversion se fait sur le prix RÉSOLU, celui de la déclinaison si
      // elle en impose un.
      const unitPriceEur =
        resolved.unitPriceXof === product.price && product.priceEur !== null
          ? product.priceEur
          : xofToEur(resolved.unitPriceXof);

      const lineWeight = resolved.unitWeight * resolved.quantity;

      totalWeight += lineWeight;
      subtotalEur += unitPriceEur * resolved.quantity;

      return {
        productId: resolved.productId,
        variantId: resolved.variantId,
        merchantId: resolved.merchantId,
        quantity: resolved.quantity,
        unitPrice: roundEur(unitPriceEur),
        weight: lineWeight,
        variantLabel: resolved.variantLabel,
        measurements: resolved.measurements,
      };
    });

    totalWeight = Math.round(totalWeight * 1000) / 1000; // au gramme

    const remainingWeight =
      Math.round((trip.maxWeight - trip.usedWeight) * 1000) / 1000;

    if (totalWeight > remainingWeight) {
      throw new BadRequestException(
        `Poids trop élevé : ${totalWeight} kg demandés, ${remainingWeight} kg disponibles chez ce GP. ` +
          'Retirez des articles ou choisissez un autre GP.',
      );
    }

    const totals = computeOrderTotals({
      subtotalEur,
      totalWeightKg: totalWeight,
      pricePerKgEur: trip.pricePerKg,
    });

    // --- Un colis par commerçant ------------------------------------------
    const merchantIds = [...new Set(lines.map((l) => l.merchantId))];

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          clientId: userId,
          status: OrderStatus.PENDING,
          subtotalEur: totals.subtotalEur,
          shippingEur: totals.shippingEur,
          platformFeeEur: totals.platformFeeEur,
          totalEur: totals.totalEur,
          deliveryAddress: dto.deliveryAddress,
          deliveryCity: dto.deliveryCity,
          deliveryCountry: dto.deliveryCountry.toUpperCase(),
        },
      });

      for (const merchantId of merchantIds) {
        const merchantLines = lines.filter((l) => l.merchantId === merchantId);
        const packageWeight =
          Math.round(
            merchantLines.reduce((sum, l) => sum + l.weight, 0) * 1000,
          ) / 1000;

        const pkg = await tx.package.create({
          data: {
            orderId: order.id,
            gpId: trip.gpId,
            tripId: trip.id,
            merchantId,
            status: PackageStatus.AWAITING_DROPOFF,
            weight: packageWeight,
          },
        });

        await tx.orderItem.createMany({
          data: merchantLines.map((line) => ({
            orderId: order.id,
            productId: line.productId,
            merchantId: line.merchantId,
            packageId: pkg.id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            weight: line.weight,
            variantLabel: line.variantLabel,
            measurements: line.measurements ?? undefined,
            status: ItemStatus.PENDING,
          })),
        });
      }

      // Le fil de discussion est créé avec la commande : client, GP et
      // commerçants doivent pouvoir échanger avant même le paiement.
      //
      // Les participants sont inscrits explicitement dans ChatMember : le
      // contrôle d'accès ne remonte plus la commande, ce qui permet de traiter
      // de la même façon les conversations directes, qui n'en ont aucune.
      const [gpUser, merchantUsers] = await Promise.all([
        tx.gP.findUnique({
          where: { id: trip.gpId },
          select: { userId: true },
        }),
        tx.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { userId: true },
        }),
      ]);

      const participantIds = new Set<string>([
        userId,
        ...merchantUsers.map((m) => m.userId),
      ]);
      if (gpUser) participantIds.add(gpUser.userId);

      await tx.chat.create({
        data: {
          orderId: order.id,
          kind: ChatKind.ORDER,
          members: {
            create: [...participantIds].map((id) => ({ userId: id })),
          },
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: ORDER_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Passe la commande en CONFIRMED et réserve la capacité du GP.
   *
   * À appeler après encaissement (webhook Stripe/Wave, branché plus tard).
   * La réservation se fait par un UPDATE conditionnel en une seule requête :
   * Postgres garantit alors l'atomicité, donc deux clients qui commandent
   * simultanément les derniers kilos ne peuvent pas passer tous les deux.
   */
  /**
   * Confirme le paiement d'une commande.
   *
   * ⚠️ AUCUN ARGENT NE CHANGE DE MAIN ICI. La méthode écrit un `Payment`
   * COMPLETED et réserve la capacité du GP en se contentant de croire le
   * client sur parole. Tant que le module `payments` n'existe pas, c'est un
   * bouton « ma commande est payée » que n'importe quel compte peut appeler
   * sur ses propres commandes — autrement dit, de la marchandise gratuite.
   *
   * D'où le verrou de production ci-dessous. Il ne change RIEN en
   * développement, où cette route reste le seul moyen de dérouler le tunnel
   * de bout en bout ; il empêche seulement que l'oubli parte en ligne. Le
   * jour où un prestataire encaisse réellement, ce sera son webhook qui
   * appellera cette logique, et le verrou tombera avec l'endpoint client.
   */
  async confirmPayment(orderId: string, userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Le paiement en ligne n’est pas encore disponible.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        packages: { select: { tripId: true, weight: true } },
        items: {
          select: {
            product: { select: { name: true, productionDays: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable.');
    }

    if (order.clientId !== userId) {
      throw new ForbiddenException("Cette commande ne vous appartient pas.");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('Cette commande a déjà été confirmée.');
    }

    const tripId = order.packages[0]?.tripId;
    if (!tripId) {
      throw new ConflictException('Commande incohérente : aucun colis.');
    }

    await this.assertProductionStillFits(order.items, tripId);

    const totalWeight =
      Math.round(order.packages.reduce((s, p) => s + p.weight, 0) * 1000) /
      1000;

    return this.prisma.$transaction(async (tx) => {
      // Prisma ne sait pas comparer deux colonnes de la même ligne dans un
      // `where`, d'où le SQL brut. Le garde-fou est dans la clause WHERE :
      // si la capacité a été prise entre-temps, 0 ligne est affectée.
      const reserved = await tx.$executeRaw`
        UPDATE trips
        SET "usedWeight" = "usedWeight" + ${totalWeight}
        WHERE id = ${tripId}
          AND status = 'UPCOMING'
          AND "maxWeight" - "usedWeight" >= ${totalWeight}
      `;

      if (reserved === 0) {
        throw new ConflictException(
          "Ce GP n'a plus assez de place pour votre commande. " +
            'Vous n\'avez pas été débité : choisissez un autre GP.',
        );
      }

      await tx.payment.create({
        data: {
          orderId: order.id,
          type: PaymentType.ESCROW_HOLD,
          status: PaymentStatus.COMPLETED,
          amount: order.totalEur,
          currency: 'EUR',
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CONFIRMED },
        include: ORDER_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Revérifie les délais de confection au moment du paiement.
   *
   * Le même contrôle existe à la création de la commande, mais il ne suffit
   * pas : c'est ICI que la capacité du GP est réservée, et une commande peut
   * rester en attente plusieurs jours avant d'être payée. Vérifié une seule
   * fois à la création, un sur-mesure de 30 jours commandé pour un départ à
   * 35 jours, puis payé 10 jours plus tard, réserverait une place sur un vol
   * qui part avant que le vêtement soit fini.
   *
   * Le refus intervient avant le moindre débit : la commande reste en
   * attente, le client choisit un autre GP.
   */
  private async assertProductionStillFits(
    items: { product: { name: string; productionDays: number | null } }[],
    tripId: string,
  ): Promise<void> {
    const longest = items.reduce<{ name: string; days: number } | null>(
      (worst, item) => {
        const days = item.product.productionDays ?? 0;
        if (days === 0) return worst;
        return !worst || days > worst.days
          ? { name: item.product.name, days }
          : worst;
      },
      null,
    );

    if (!longest) return;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { departureDate: true },
    });

    if (!trip) return;

    const readyAt = new Date(Date.now() + longest.days * 24 * 60 * 60 * 1000);

    if (readyAt > trip.departureDate) {
      throw new ConflictException(
        `« ${longest.name} » demande ${longest.days} jours de confection et ce GP part avant. ` +
          "Vous n'avez pas été débité : choisissez un départ plus tardif.",
      );
    }
  }

  async listOwn(userId: string, dto: ListOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      clientId: userId,
      ...(dto.status ? { status: dto.status } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (dto.page - 1) * dto.limit,
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

  /**
   * Accessible au client, au GP qui transporte, et aux commerçants concernés.
   * Chacun a une raison légitime de suivre la commande.
   */
  async findById(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_DETAIL_INCLUDE,
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable.');
    }

    if (order.clientId === userId) {
      return order;
    }

    const [gp, merchant] = await Promise.all([
      this.prisma.gP.findUnique({ where: { userId }, select: { id: true } }),
      this.prisma.merchant.findUnique({
        where: { userId },
        select: { id: true },
      }),
    ]);

    const isCarrier = gp && order.packages.some((p) => p.gpId === gp.id);
    const isSupplier =
      merchant && order.packages.some((p) => p.merchantId === merchant.id);

    if (!isCarrier && !isSupplier) {
      throw new ForbiddenException("Cette commande ne vous concerne pas.");
    }

    return order;
  }

  /**
   * Annulation par le client, tant qu'aucun colis n'a été remis au GP.
   * Au-delà, un commerçant a déjà engagé des frais : cela relève du litige.
   */
  async cancel(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { packages: true },
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable.');
    }

    if (order.clientId !== userId) {
      throw new ForbiddenException("Cette commande ne vous appartient pas.");
    }

    const cancellable: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
    ];
    if (!cancellable.includes(order.status)) {
      throw new ConflictException(
        "Cette commande est trop avancée pour être annulée. Ouvrez un litige.",
      );
    }

    const alreadyMoving = order.packages.some(
      (p) =>
        p.status !== PackageStatus.AWAITING_DROPOFF &&
        p.status !== PackageStatus.CANCELLED,
    );
    if (alreadyMoving) {
      throw new ConflictException(
        'Un colis a déjà été remis au GP. Ouvrez un litige.',
      );
    }

    const wasConfirmed = order.status === OrderStatus.CONFIRMED;
    const tripId = order.packages[0]?.tripId;
    const totalWeight =
      Math.round(order.packages.reduce((s, p) => s + p.weight, 0) * 1000) /
      1000;

    return this.prisma.$transaction(async (tx) => {
      // La capacité n'a été réservée qu'au paiement : on ne la libère donc
      // que si la commande était effectivement confirmée.
      if (wasConfirmed && tripId) {
        await tx.$executeRaw`
          UPDATE trips
          SET "usedWeight" = GREATEST("usedWeight" - ${totalWeight}, 0)
          WHERE id = ${tripId}
        `;

        await tx.payment.create({
          data: {
            orderId: order.id,
            type: PaymentType.REFUND,
            status: PaymentStatus.PENDING,
            amount: order.totalEur,
            currency: 'EUR',
            recipientId: order.clientId,
          },
        });
      }

      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        data: { status: ItemStatus.CANCELLED },
      });

      await tx.package.updateMany({
        where: { orderId: order.id },
        data: { status: PackageStatus.CANCELLED },
      });

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: wasConfirmed ? OrderStatus.REFUNDED : OrderStatus.CANCELLED,
        },
        include: ORDER_DETAIL_INCLUDE,
      });
    });
  }
}
