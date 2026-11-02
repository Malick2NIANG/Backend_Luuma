import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ItemStatus,
  OrderStatus,
  Package,
  PackageStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
} from '@prisma/client';
import { computePackageRefund, roundEur } from '../common/order-pricing';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeliverPackageDto,
  DropOffPackageDto,
  ReceivePackageDto,
  RefusePackageDto,
} from './dto/package-action.dto';

const PACKAGE_DETAIL_INCLUDE = {
  merchant: { select: { id: true, shopName: true, city: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, images: true } },
    },
  },
  trip: {
    select: {
      id: true,
      originCity: true,
      destCity: true,
      destCountry: true,
      departureDate: true,
      pricePerKg: true,
      status: true,
    },
  },
} satisfies Prisma.PackageInclude;

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Accès ---------------------------------------------------------------

  private async getMerchantPackage(id: string, userId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      throw new ForbiddenException("Vous n'avez pas de boutique.");
    }

    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) {
      throw new NotFoundException('Colis introuvable.');
    }
    if (pkg.merchantId !== merchant.id) {
      throw new ForbiddenException("Ce colis n'est pas le vôtre.");
    }

    return pkg;
  }

  private async getGpPackage(id: string, userId: string) {
    const gp = await this.prisma.gP.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!gp) {
      throw new ForbiddenException("Vous n'êtes pas enregistré comme GP.");
    }

    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) {
      throw new NotFoundException('Colis introuvable.');
    }
    if (pkg.gpId !== gp.id) {
      throw new ForbiddenException("Ce colis ne vous est pas destiné.");
    }

    return pkg;
  }

  // --- Lectures ------------------------------------------------------------

  /** Colis à collecter pour un GP, éventuellement filtrés par trajet. */
  async listForGp(userId: string, tripId?: string) {
    const gp = await this.prisma.gP.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!gp) {
      throw new ForbiddenException("Vous n'êtes pas enregistré comme GP.");
    }

    return this.prisma.package.findMany({
      where: { gpId: gp.id, ...(tripId ? { tripId } : {}) },
      include: PACKAGE_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Colis qu'un commerçant doit préparer et déposer. */
  async listForMerchant(userId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!merchant) {
      throw new ForbiddenException("Vous n'avez pas de boutique.");
    }

    return this.prisma.package.findMany({
      where: { merchantId: merchant.id },
      include: PACKAGE_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Transitions ---------------------------------------------------------

  /**
   * Le commerçant remet le colis. Refusé tant que la commande n'est pas payée :
   * sans escrow constitué, il engagerait des frais sans garantie.
   */
  async dropOff(
    id: string,
    userId: string,
    dto: DropOffPackageDto,
  ): Promise<Package> {
    const pkg = await this.getMerchantPackage(id, userId);

    if (pkg.status !== PackageStatus.AWAITING_DROPOFF) {
      throw new ConflictException('Ce colis a déjà été déposé.');
    }

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: pkg.orderId },
      select: { status: true },
    });

    if (order.status !== OrderStatus.CONFIRMED &&
        order.status !== OrderStatus.COLLECTING) {
      throw new ConflictException(
        "Cette commande n'est pas encore payée : ne remettez pas le colis.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id },
        data: {
          status: PackageStatus.DROPPED_OFF,
          prepPhotoUrl: dto.prepPhotoUrl,
        },
      });

      await tx.orderItem.updateMany({
        where: { packageId: id },
        data: { status: ItemStatus.PREPARING },
      });

      await tx.order.update({
        where: { id: pkg.orderId },
        data: { status: OrderStatus.COLLECTING },
      });

      return updated;
    });
  }

  /** Le GP accuse réception du colis. */
  async receive(
    id: string,
    userId: string,
    dto: ReceivePackageDto,
  ): Promise<Package> {
    const pkg = await this.getGpPackage(id, userId);

    if (pkg.status !== PackageStatus.DROPPED_OFF) {
      throw new ConflictException(
        "Ce colis n'a pas encore été déposé par le commerçant.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id },
        data: {
          status: PackageStatus.RECEIVED_BY_GP,
          receptionPhotoUrl: dto.receptionPhotoUrl,
        },
      });

      await tx.orderItem.updateMany({
        where: { packageId: id },
        data: { status: ItemStatus.HANDED_TO_GP },
      });

      return updated;
    });
  }

  /** Le GP remet le colis au client : déclenche la libération de l'escrow. */
  async deliver(
    id: string,
    userId: string,
    dto: DeliverPackageDto,
  ): Promise<Package> {
    const pkg = await this.getGpPackage(id, userId);

    const deliverable: PackageStatus[] = [
      PackageStatus.RECEIVED_BY_GP,
      PackageStatus.IN_TRANSIT,
    ];
    if (!deliverable.includes(pkg.status)) {
      throw new ConflictException(
        "Ce colis n'est pas dans un état permettant la livraison.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id },
        data: {
          status: PackageStatus.DELIVERED,
          deliveryPhotoUrl: dto.deliveryPhotoUrl,
        },
      });

      await tx.orderItem.updateMany({
        where: { packageId: id },
        data: { status: ItemStatus.DELIVERED },
      });

      // La commande n'est close que lorsque plus aucun colis n'est en cours.
      const pending = await tx.package.count({
        where: {
          orderId: pkg.orderId,
          status: {
            notIn: [
              PackageStatus.DELIVERED,
              PackageStatus.REFUSED,
              PackageStatus.CANCELLED,
            ],
          },
        },
      });

      if (pending === 0) {
        await tx.order.update({
          where: { id: pkg.orderId },
          data: { status: OrderStatus.DELIVERED },
        });
      }

      return updated;
    });
  }

  /**
   * Le GP refuse un colis.
   *
   * Le reste de la commande poursuit son cours : les autres commerçants et le
   * client ne sont pas pénalisés par un refus qui ne les concerne pas. Seuls
   * les articles de ce colis sont remboursés, et le poids correspondant est
   * rendu au trajet pour qu'un autre client puisse en bénéficier.
   */
  async refuse(
    id: string,
    userId: string,
    dto: RefusePackageDto,
  ): Promise<Package> {
    const pkg = await this.getGpPackage(id, userId);

    const refusable: PackageStatus[] = [
      PackageStatus.AWAITING_DROPOFF,
      PackageStatus.DROPPED_OFF,
      PackageStatus.RECEIVED_BY_GP,
    ];
    if (!refusable.includes(pkg.status)) {
      throw new ConflictException(
        "Ce colis ne peut plus être refusé à ce stade.",
      );
    }

    const [items, trip, order] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { packageId: id },
        select: { quantity: true, unitPrice: true },
      }),
      this.prisma.trip.findUniqueOrThrow({
        where: { id: pkg.tripId },
        select: { pricePerKg: true },
      }),
      this.prisma.order.findUniqueOrThrow({
        where: { id: pkg.orderId },
        select: { status: true, clientId: true },
      }),
    ]);

    const packageSubtotalEur = roundEur(
      items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    );

    const refundAmount = computePackageRefund({
      packageSubtotalEur,
      packageWeightKg: pkg.weight,
      pricePerKgEur: trip.pricePerKg,
    });

    // Aucun escrow n'est constitué tant que la commande est PENDING : il n'y
    // a alors rien à rembourser.
    const escrowExists = order.status !== OrderStatus.PENDING;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.package.update({
        where: { id },
        data: {
          status: PackageStatus.REFUSED,
          refusalReason: dto.refusalReason,
        },
      });

      await tx.orderItem.updateMany({
        where: { packageId: id },
        data: {
          status: escrowExists ? ItemStatus.REFUNDED : ItemStatus.CANCELLED,
        },
      });

      if (escrowExists) {
        // Rend les kilos au trajet : le GP ne les transporte pas.
        await tx.$executeRaw`
          UPDATE trips
          SET "usedWeight" = GREATEST("usedWeight" - ${pkg.weight}, 0)
          WHERE id = ${pkg.tripId}
        `;

        await tx.payment.create({
          data: {
            orderId: pkg.orderId,
            type: PaymentType.REFUND,
            status: PaymentStatus.PENDING,
            amount: refundAmount,
            currency: 'EUR',
            recipientId: order.clientId,
            metadata: {
              reason: 'PACKAGE_REFUSED',
              packageId: pkg.id,
              refusalReason: dto.refusalReason,
            },
          },
        });
      }

      // Si le GP refuse tout, il ne reste plus de commande à honorer.
      const remaining = await tx.package.count({
        where: {
          orderId: pkg.orderId,
          status: {
            notIn: [
              PackageStatus.REFUSED,
              PackageStatus.CANCELLED,
              PackageStatus.DELIVERED,
            ],
          },
        },
      });

      if (remaining === 0) {
        await tx.order.update({
          where: { id: pkg.orderId },
          data: {
            status: escrowExists
              ? OrderStatus.REFUNDED
              : OrderStatus.CANCELLED,
          },
        });
      }

      return updated;
    });
  }
}
