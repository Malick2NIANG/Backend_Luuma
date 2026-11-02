import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FollowDto, FollowTarget } from './dto/follow.dto';

/** Identifiants des comptes suivis, utilisés pour pondérer le fil. */
export interface FollowedIds {
  merchantIds: string[];
  gpIds: string[];
}

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vérifie que la cible existe ET qu'elle est approuvée.
   *
   * Sans ce contrôle, on pourrait s'abonner à une boutique en attente de
   * validation — voire deviner l'existence d'un profil rejeté.
   */
  private async assertTargetExists(
    target: FollowTarget,
    targetId: string,
  ): Promise<void> {
    const found =
      target === 'merchant'
        ? await this.prisma.merchant.findFirst({
            where: { id: targetId, isApproved: true },
            select: { id: true },
          })
        : await this.prisma.gP.findFirst({
            where: { id: targetId, isApproved: true },
            select: { id: true },
          });

    if (!found) {
      throw new NotFoundException(
        target === 'merchant' ? 'Boutique introuvable.' : 'GP introuvable.',
      );
    }
  }

  /** Empêche de s'abonner à son propre profil. */
  private async assertNotSelf(
    userId: string,
    target: FollowTarget,
    targetId: string,
  ): Promise<void> {
    const own =
      target === 'merchant'
        ? await this.prisma.merchant.findUnique({
            where: { userId },
            select: { id: true },
          })
        : await this.prisma.gP.findUnique({
            where: { userId },
            select: { id: true },
          });

    if (own?.id === targetId) {
      throw new BadRequestException('Vous ne pouvez pas vous abonner à vous-même.');
    }
  }

  async follow(userId: string, dto: FollowDto) {
    await this.assertTargetExists(dto.target, dto.targetId);
    await this.assertNotSelf(userId, dto.target, dto.targetId);

    const where =
      dto.target === 'merchant'
        ? { followerId_merchantId: { followerId: userId, merchantId: dto.targetId } }
        : { followerId_gpId: { followerId: userId, gpId: dto.targetId } };

    const data =
      dto.target === 'merchant'
        ? { followerId: userId, merchantId: dto.targetId }
        : { followerId: userId, gpId: dto.targetId };

    // Upsert : réappuyer sur « suivre » ne doit pas produire d'erreur.
    await this.prisma.follow.upsert({ where, update: {}, create: data });

    return {
      following: true,
      followersCount: await this.countFollowers(dto.target, dto.targetId),
    };
  }

  async unfollow(userId: string, dto: FollowDto) {
    await this.prisma.follow.deleteMany({
      where:
        dto.target === 'merchant'
          ? { followerId: userId, merchantId: dto.targetId }
          : { followerId: userId, gpId: dto.targetId },
    });

    return {
      following: false,
      followersCount: await this.countFollowers(dto.target, dto.targetId),
    };
  }

  async countFollowers(
    target: FollowTarget,
    targetId: string,
  ): Promise<number> {
    return this.prisma.follow.count({
      where:
        target === 'merchant' ? { merchantId: targetId } : { gpId: targetId },
    });
  }

  /** Tous les abonnements d'un utilisateur, en une seule requête. */
  async getFollowedIds(userId: string): Promise<FollowedIds> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { merchantId: true, gpId: true },
    });

    return {
      merchantIds: rows
        .map((r) => r.merchantId)
        .filter((id): id is string => id !== null),
      gpIds: rows.map((r) => r.gpId).filter((id): id is string => id !== null),
    };
  }

  /** Liste enrichie, pour l'écran « Mes abonnements ». */
  async listFollowing(userId: string) {
    const { merchantIds, gpIds } = await this.getFollowedIds(userId);

    const [merchants, gps] = await Promise.all([
      merchantIds.length
        ? this.prisma.merchant.findMany({
            where: { id: { in: merchantIds } },
            select: {
              id: true,
              shopName: true,
              city: true,
              rating: true,
              totalReviews: true,
              user: { select: { name: true, avatar: true } },
              _count: { select: { followers: true, products: true } },
            },
          })
        : [],
      gpIds.length
        ? this.prisma.gP.findMany({
            where: { id: { in: gpIds } },
            select: {
              id: true,
              rating: true,
              totalReviews: true,
              totalTrips: true,
              user: { select: { name: true, avatar: true } },
              _count: { select: { followers: true, trips: true } },
            },
          })
        : [],
    ]);

    return { merchants, gps };
  }
}
