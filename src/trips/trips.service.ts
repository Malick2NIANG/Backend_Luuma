import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Trip, TripStatus } from '@prisma/client';
import { resolveMaxWeightPerTrip } from '../common/gp-capacity';
import { GpsService } from '../gps/gps.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { SearchTripDto } from './dto/search-trip.dto';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gps: GpsService,
  ) {}

  async create(userId: string, dto: CreateTripDto): Promise<Trip> {
    // Contrôle centralisé (existence + approbation), identique à celui
    // qu'appliquent les autres modules.
    const gp = await this.gps.getOwnGpOrThrow(userId);

    if (dto.maxWeight > gp.maxWeightPerTrip) {
      throw new BadRequestException(
        `Votre plafond actuel est de ${gp.maxWeightPerTrip} kg par voyage. ` +
          'Il augmente à mesure que vous menez des voyages à terme.',
      );
    }

    return this.prisma.trip.create({
      data: {
        gpId: gp.id,
        originCity: dto.originCity,
        destCity: dto.destCity,
        destCountry: dto.destCountry,
        departureDate: new Date(dto.departureDate),
        arrivalDate: dto.arrivalDate ? new Date(dto.arrivalDate) : undefined,
        pricePerKg: dto.pricePerKg,
        maxWeight: dto.maxWeight,
        flightTicketUrl: dto.flightTicketUrl,
      },
    });
  }

  async search(dto: SearchTripDto) {
    const { destCity, destCountry, date, page, limit } = dto;

    // Prisma can't compare two columns of the same row (maxWeight vs
    // usedWeight) in a `where` clause, so availability is filtered in JS
    // after fetching all status/destination/date matches.
    const trips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.UPCOMING,
        destCity,
        destCountry,
        ...(date ? { departureDate: { gte: new Date(date) } } : {}),
      },
      orderBy: { departureDate: 'asc' },
    });

    const available = trips.filter(
      (trip) => trip.maxWeight - trip.usedWeight > 0,
    );

    const total = available.length;
    const start = (page - 1) * limit;
    const data = available.slice(start, start + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        gp: {
          select: {
            id: true,
            rating: true,
            totalTrips: true,
            user: {
              select: {
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Trajet introuvable.');
    }

    return trip;
  }

  async updateStatus(
    id: string,
    userId: string,
    status: TripStatus,
  ): Promise<Trip> {
    const gp = await this.prisma.gP.findUnique({ where: { userId } });

    if (!gp) {
      throw new ForbiddenException("Vous n'êtes pas enregistré comme GP.");
    }

    const trip = await this.prisma.trip.findUnique({ where: { id } });

    if (!trip) {
      throw new NotFoundException('Trajet introuvable.');
    }

    if (trip.gpId !== gp.id) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que vos propres trajets.',
      );
    }

    // Un voyage déjà comptabilisé ne doit pas l'être une seconde fois si le
    // GP repasse le statut à COMPLETED.
    const completesNow =
      status === TripStatus.COMPLETED && trip.status !== TripStatus.COMPLETED;

    if (!completesNow) {
      return this.prisma.trip.update({ where: { id }, data: { status } });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id },
        data: { status },
      });

      // Le voyage honoré fait progresser le plafond de confiance du GP.
      const completedTrips = gp.totalTrips + 1;
      await tx.gP.update({
        where: { id: gp.id },
        data: {
          totalTrips: completedTrips,
          maxWeightPerTrip: resolveMaxWeightPerTrip({
            completedTrips,
            currentMaxWeightPerTrip: gp.maxWeightPerTrip,
          }),
        },
      });

      return updated;
    });
  }
}
