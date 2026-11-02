import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PackageStatus, Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  ApproveDto,
  ListPendingDto,
  RejectDto,
  SetGpCapacityDto,
} from './dto/admin-actions.dto';

/** Identité du postulant, nécessaire pour instruire un dossier. */
const APPLICANT_USER_SELECT = {
  select: { id: true, name: true, email: true, phone: true, createdAt: true },
};

/**
 * Ce qu'un dossier expose, champ par champ.
 *
 * Un `include` renvoyait la ligne ENTIÈRE, coordonnées de paiement comprises
 * — `payoutMethod`, `payoutAccount` — alors qu'aucun écran ne les affiche.
 * Elles traversaient le réseau et dormaient dans la mémoire du navigateur
 * pour rien. Instruire un dossier, c'est vérifier une identité et une
 * activité ; le compte Wave du postulant n'entre pas dans cette décision.
 *
 * Énumérer coûte quelques lignes, mais rend l'omission visible : ajouter un
 * champ sensible au schéma ne l'exposera plus par simple effet de bord.
 */
const PENDING_MERCHANT_SELECT = {
  id: true,
  shopName: true,
  description: true,
  address: true,
  city: true,
  country: true,
  idDocumentUrl: true,
  isKycVerified: true,
  rejectionNote: true,
  createdAt: true,
  user: APPLICANT_USER_SELECT,
  _count: { select: { products: true } },
} satisfies Prisma.MerchantSelect;

const PENDING_GP_SELECT = {
  id: true,
  idDocumentUrl: true,
  isKycVerified: true,
  rejectionNote: true,
  totalTrips: true,
  maxWeightPerTrip: true,
  createdAt: true,
  user: APPLICANT_USER_SELECT,
} satisfies Prisma.GPSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // --- Commerçants ---------------------------------------------------------

  async listPendingMerchants(dto: ListPendingDto) {
    const where: Prisma.MerchantWhereInput = { isApproved: false };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.merchant.count({ where }),
      this.prisma.merchant.findMany({
        where,
        select: PENDING_MERCHANT_SELECT,
        // Les plus anciennes demandes d'abord : personne ne doit être oublié.
        orderBy: { createdAt: 'asc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
    ]);

    return { data, total, page: dto.page, limit: dto.limit };
  }

  async approveMerchant(id: string, dto: ApproveDto) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Boutique introuvable.');

    return this.prisma.merchant.update({
      where: { id },
      data: {
        isApproved: true,
        // Une approbation efface le motif de rejet précédent : le dossier
        // repart propre si le commerçant avait corrigé et repostulé.
        rejectionNote: null,
        ...(dto.markKycVerified ? { isKycVerified: true } : {}),
      },
    });
  }

  async rejectMerchant(id: string, dto: RejectDto) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundException('Boutique introuvable.');

    return this.prisma.merchant.update({
      where: { id },
      data: { isApproved: false, rejectionNote: dto.rejectionNote },
    });
  }

  // --- GP ------------------------------------------------------------------

  async listPendingGps(dto: ListPendingDto) {
    const where: Prisma.GPWhereInput = { isApproved: false };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.gP.count({ where }),
      this.prisma.gP.findMany({
        where,
        select: PENDING_GP_SELECT,
        orderBy: { createdAt: 'asc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
    ]);

    return { data, total, page: dto.page, limit: dto.limit };
  }

  async approveGp(id: string, dto: ApproveDto) {
    const gp = await this.prisma.gP.findUnique({ where: { id } });
    if (!gp) throw new NotFoundException('GP introuvable.');

    return this.prisma.gP.update({
      where: { id },
      data: {
        isApproved: true,
        rejectionNote: null,
        ...(dto.markKycVerified ? { isKycVerified: true } : {}),
      },
    });
  }

  async rejectGp(id: string, dto: RejectDto) {
    const gp = await this.prisma.gP.findUnique({ where: { id } });
    if (!gp) throw new NotFoundException('GP introuvable.');

    return this.prisma.gP.update({
      where: { id },
      data: { isApproved: false, rejectionNote: dto.rejectionNote },
    });
  }

  /**
   * Relève manuellement le plafond d'un GP.
   *
   * `resolveMaxWeightPerTrip` prenant le maximum avec la valeur courante, la
   * progression automatique ne redescendra jamais ce plafond par la suite.
   */
  async setGpCapacity(id: string, dto: SetGpCapacityDto) {
    const gp = await this.prisma.gP.findUnique({ where: { id } });
    if (!gp) throw new NotFoundException('GP introuvable.');

    return this.prisma.gP.update({
      where: { id },
      data: { maxWeightPerTrip: dto.maxWeightPerTrip },
    });
  }

  // --- KYC -----------------------------------------------------------------

  /**
   * URL temporaire pour consulter une pièce d'identité.
   *
   * Les documents KYC sont dans le bucket privé et l'endpoint public de
   * stockage est réservé au propriétaire du fichier : sans ce point d'entrée
   * dédié, un admin ne pourrait pas instruire un dossier.
   */
  async getKycDocumentUrl(
    profileType: 'merchant' | 'gp',
    id: string,
  ): Promise<{ url: string }> {
    const profile =
      profileType === 'merchant'
        ? await this.prisma.merchant.findUnique({
            where: { id },
            select: { idDocumentUrl: true },
          })
        : await this.prisma.gP.findUnique({
            where: { id },
            select: { idDocumentUrl: true },
          });

    if (!profile) {
      throw new NotFoundException('Profil introuvable.');
    }

    if (!profile.idDocumentUrl) {
      throw new BadRequestException(
        "Ce profil n'a pas fourni de pièce d'identité.",
      );
    }

    return { url: await this.storage.presignDownload(profile.idDocumentUrl) };
  }

  // --- Tableau de bord -----------------------------------------------------

  async getStats() {
    const [
      users,
      pendingMerchants,
      approvedMerchants,
      pendingGps,
      approvedGps,
      activeTrips,
      products,
      ordersByStatus,
      refusedPackages,
      escrowHeld,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.merchant.count({ where: { isApproved: false } }),
      this.prisma.merchant.count({ where: { isApproved: true } }),
      this.prisma.gP.count({ where: { isApproved: false } }),
      this.prisma.gP.count({ where: { isApproved: true } }),
      this.prisma.trip.count({ where: { status: TripStatus.UPCOMING } }),
      this.prisma.product.count({ where: { isAvailable: true } }),
      // `orderBy` est obligatoire sur un groupBy Prisma ; sans lui la
      // surcharge ne se résout pas et le type de `_count` reste ambigu.
      // `_count: true` renvoie directement un nombre par groupe.
      this.prisma.order.groupBy({
        by: ['status'],
        _count: true,
        orderBy: { status: 'asc' },
      }),
      this.prisma.package.count({ where: { status: PackageStatus.REFUSED } }),
      // Montant actuellement sous séquestre : commandes payées non livrées.
      this.prisma.order.aggregate({
        _sum: { totalEur: true },
        where: {
          status: {
            in: [
              OrderStatus.CONFIRMED,
              OrderStatus.COLLECTING,
              OrderStatus.IN_TRANSIT,
            ],
          },
        },
      }),
    ]);

    return {
      users,
      merchants: { pending: pendingMerchants, approved: approvedMerchants },
      gps: { pending: pendingGps, approved: approvedGps },
      activeTrips,
      products,
      orders: Object.fromEntries(
        ordersByStatus.map((row) => [row.status, row._count]),
      ),
      refusedPackages,
      escrowHeldEur: escrowHeld._sum.totalEur ?? 0,
    };
  }
}
