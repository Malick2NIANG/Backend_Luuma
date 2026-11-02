import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GP, Prisma, RoleType, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateGpDto } from './dto/create-gp.dto';
import { UpdateGpDto } from './dto/update-gp.dto';

/** Profil public d'un GP — sans KYC ni coordonnées de paiement. */
const PUBLIC_GP_SELECT = {
  id: true,
  rating: true,
  totalReviews: true,
  totalTrips: true,
  createdAt: true,
  user: {
    select: {
      name: true,
      avatar: true,
    },
  },
} satisfies Prisma.GPSelect;

@Injectable()
export class GpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(userId: string, dto: CreateGpDto): Promise<GP> {
    const existing = await this.prisma.gP.findUnique({ where: { userId } });

    if (existing) {
      throw new ConflictException('Vous êtes déjà enregistré comme GP.');
    }

    if (dto.idDocumentUrl) {
      await this.storage.assertOwnedUpload(dto.idDocumentUrl, userId, 'kyc');
    }

    // Profil et rôle créés ensemble : un profil sans rôle GP laisserait le
    // compte dans un état incohérent (même logique que pour les commerçants).
    return this.prisma.$transaction(async (tx) => {
      const gp = await tx.gP.create({
        data: {
          userId,
          idDocumentUrl: dto.idDocumentUrl,
          payoutMethod: dto.payoutMethod,
          payoutAccount: dto.payoutAccount,
          // isApproved reste false : validation par un admin après contrôle
          // du document d'identité. maxWeightPerTrip garde sa valeur d'essai.
        },
      });

      await tx.userRole.upsert({
        where: { userId_role: { userId, role: RoleType.GP } },
        update: {},
        create: { userId, role: RoleType.GP },
      });

      return gp;
    });
  }

  async findOwn(userId: string) {
    const gp = await this.prisma.gP.findUnique({
      where: { userId },
      include: {
        trips: {
          orderBy: { departureDate: 'desc' },
          take: 20,
          select: {
            id: true,
            originCity: true,
            destCity: true,
            destCountry: true,
            departureDate: true,
            pricePerKg: true,
            maxWeight: true,
            usedWeight: true,
            status: true,
          },
        },
      },
    });

    if (!gp) {
      throw new NotFoundException("Vous n'êtes pas enregistré comme GP.");
    }

    return gp;
  }

  async updateOwn(userId: string, dto: UpdateGpDto): Promise<GP> {
    const gp = await this.prisma.gP.findUnique({ where: { userId } });

    if (!gp) {
      throw new NotFoundException("Vous n'êtes pas enregistré comme GP.");
    }

    if (dto.idDocumentUrl) {
      await this.storage.assertOwnedUpload(dto.idDocumentUrl, userId, 'kyc');
    }

    return this.prisma.gP.update({
      where: { id: gp.id },
      data: {
        idDocumentUrl: dto.idDocumentUrl,
        payoutMethod: dto.payoutMethod,
        payoutAccount: dto.payoutAccount,
      },
    });
  }

  /**
   * Annuaire des GP, pour l'onglet « GP » de la recherche.
   *
   * Seuls les GP ayant au moins un trajet à venir encore ouvert sont listés :
   * un GP sans trajet n'est pas réservable, et l'afficher ne mènerait qu'à un
   * profil vide. `q` porte sur le nom du GP et sur ses destinations — c'est
   * ainsi qu'on cherche un GP : « Paris », « Lyon », rarement par nom.
   */
  async list(params: { q?: string; viewerId?: string }) {
    const now = new Date();

    const openTrip: Prisma.TripWhereInput = {
      status: TripStatus.UPCOMING,
      departureDate: { gte: now },
    };

    const destinationMatch: Prisma.TripWhereInput | undefined = params.q
      ? {
          ...openTrip,
          OR: [
            { destCity: { contains: params.q, mode: 'insensitive' } },
            { destCountry: { contains: params.q, mode: 'insensitive' } },
            { originCity: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const gps = await this.prisma.gP.findMany({
      where: {
        isApproved: true,
        trips: { some: destinationMatch ?? openTrip },
        ...(params.q
          ? {
              // Le nom élargit la recherche par destination, il ne la
              // restreint pas : chercher « Fatou » doit fonctionner aussi.
              OR: [
                { user: { name: { contains: params.q, mode: 'insensitive' } } },
                { trips: { some: destinationMatch ?? openTrip } },
              ],
            }
          : {}),
      },
      // Les mieux notés d'abord, puis les plus expérimentés : c'est l'ordre
      // dans lequel un client accorde sa confiance.
      orderBy: [{ rating: 'desc' }, { totalTrips: 'desc' }],
      take: 50,
      select: {
        ...PUBLIC_GP_SELECT,
        maxWeightPerTrip: true,
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { followers: true } },
        trips: {
          where: openTrip,
          orderBy: { departureDate: 'asc' },
          take: 4,
          select: {
            id: true,
            originCity: true,
            destCity: true,
            destCountry: true,
            departureDate: true,
            pricePerKg: true,
            maxWeight: true,
            usedWeight: true,
          },
        },
      },
    });

    const followedIds = params.viewerId
      ? new Set(
          (
            await this.prisma.follow.findMany({
              where: {
                followerId: params.viewerId,
                gpId: { in: gps.map((g) => g.id) },
              },
              select: { gpId: true },
            })
          ).map((f) => f.gpId),
        )
      : new Set<string>();

    return gps.map(({ _count, ...gp }) => ({
      ...gp,
      followersCount: _count.followers,
      isFollowedByMe: followedIds.has(gp.id),
    }));
  }

  /**
   * Profil public + trajets à venir encore ouverts.
   *
   * `viewerId` est facultatif : le profil se consulte sans compte, mais un
   * utilisateur connecté doit voir s'il est déjà abonné.
   */
  async findById(id: string, viewerId?: string) {
    const gp = await this.prisma.gP.findUnique({
      where: { id },
      select: {
        ...PUBLIC_GP_SELECT,
        isApproved: true,
        maxWeightPerTrip: true,
        // `user.id` est nécessaire au bouton « Message » : la conversation
        // directe se noue entre comptes, pas entre profils GP.
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { followers: true } },
        trips: {
          where: {
            status: TripStatus.UPCOMING,
            departureDate: { gte: new Date() },
          },
          orderBy: { departureDate: 'asc' },
          select: {
            id: true,
            originCity: true,
            destCity: true,
            destCountry: true,
            departureDate: true,
            pricePerKg: true,
            maxWeight: true,
            usedWeight: true,
          },
        },
      },
    });

    // Même réponse qu'un GP inexistant : ne pas révéler l'existence d'un
    // profil en attente de validation.
    if (!gp || !gp.isApproved) {
      throw new NotFoundException('GP introuvable.');
    }

    const isFollowedByMe = viewerId
      ? (await this.prisma.follow.count({
          where: { followerId: viewerId, gpId: id },
        })) > 0
      : false;

    const { isApproved: _isApproved, _count, ...publicGp } = gp;
    return {
      ...publicGp,
      followersCount: _count.followers,
      isFollowedByMe,
    };
  }

  /**
   * Le profil GP de l'utilisateur, approuvé ou non.
   *
   * Un dossier en attente peut préparer ses trajets : le fil et l'annuaire
   * filtrent sur `gp.isApproved`, donc rien n'est visible avant validation.
   * Même raisonnement que pour la boutique — l'attente n'a pas à être un
   * temps mort.
   */
  /**
   * Les trajets du GP, à venir et passés.
   *
   * Distinct de `GET /trips/search`, qui ne montre que ce qui est ouvert aux
   * commandes : le GP doit voir aussi ses trajets terminés et annulés, sans
   * quoi son historique disparaît le jour où le voyage se termine.
   */
  async listOwnTrips(userId: string) {
    const gp = await this.getOwnGpOrThrow(userId);

    const trips = await this.prisma.trip.findMany({
      where: { gpId: gp.id },
      orderBy: { departureDate: 'desc' },
      select: {
        id: true,
        originCity: true,
        originCountry: true,
        destCity: true,
        destCountry: true,
        departureDate: true,
        arrivalDate: true,
        pricePerKg: true,
        maxWeight: true,
        usedWeight: true,
        status: true,
        createdAt: true,
        _count: { select: { packages: true } },
      },
    });

    return trips.map(({ _count, ...trip }) => ({
      ...trip,
      packageCount: _count.packages,
      // Calculée ici plutôt que côté client : c'est la même soustraction qui
      // décide, à la commande, si un colis tient encore dans la valise.
      // La dupliquer inviterait les deux à diverger.
      remainingWeight: Math.max(0, trip.maxWeight - trip.usedWeight),
    }));
  }

  /**
   * Chiffres de l'espace GP.
   *
   * `estimatedEarningsEur` est un ORDRE DE GRANDEUR : poids transporté ×
   * prix au kilo, sans commission ni remboursements. Le décompte réel viendra
   * avec le module de paiement — mieux vaut un chiffre annoncé comme indicatif
   * qu'un chiffre faux présenté comme un solde.
   */
  async getOwnStats(userId: string) {
    const gp = await this.getOwnGpOrThrow(userId);

    const [upcomingTrips, trips, toCollect, delivered] =
      await this.prisma.$transaction([
        this.prisma.trip.count({
          where: {
            gpId: gp.id,
            status: { in: [TripStatus.UPCOMING, TripStatus.COLLECTING] },
          },
        }),
        this.prisma.trip.findMany({
          where: { gpId: gp.id, status: TripStatus.COMPLETED },
          select: { usedWeight: true, pricePerKg: true },
        }),
        // Colis déposés par un commerçant que le GP n'a pas encore récupérés :
        // c'est ce qui attend une action de sa part.
        this.prisma.package.count({
          where: { gpId: gp.id, status: 'DROPPED_OFF' },
        }),
        this.prisma.package.count({
          where: { gpId: gp.id, status: 'DELIVERED' },
        }),
      ]);

    const estimatedEarningsEur = trips.reduce(
      (total, trip) => total + trip.usedWeight * trip.pricePerKg,
      0,
    );

    return {
      upcomingTrips,
      completedTrips: gp.totalTrips,
      toCollectCount: toCollect,
      deliveredCount: delivered,
      estimatedEarningsEur,
      /** Palier de confiance courant, en kg par voyage. */
      maxWeightPerTrip: gp.maxWeightPerTrip,
      rating: gp.rating,
      totalReviews: gp.totalReviews,
      isApproved: gp.isApproved,
    };
  }

  async getOwnGpOrThrow(userId: string): Promise<GP> {
    const gp = await this.prisma.gP.findUnique({ where: { userId } });

    if (!gp) {
      throw new ForbiddenException(
        'Vous devez créer un profil GP avant de publier un trajet.',
      );
    }

    return gp;
  }

  /** Le profil GP, à condition qu'il soit approuvé. */
  async getApprovedGpOrThrow(userId: string): Promise<GP> {
    const gp = await this.getOwnGpOrThrow(userId);

    if (!gp.isApproved) {
      throw new ForbiddenException(
        "Votre profil GP n'est pas encore approuvé par un administrateur.",
      );
    }

    return gp;
  }
}
