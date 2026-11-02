import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  RoleType,
  StoryMediaType,
} from '@prisma/client';
import { FollowsService } from '../follows/follows.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateStoryDto } from './dto/create-story.dto';

/** Durée de vie d'une story. */
const STORY_TTL_HOURS = 24;

/**
 * En dessous de ce nombre d'abonnements, le bandeau serait vide et la
 * fonctionnalité morte-née. On le complète alors par de la découverte.
 */
const COLD_START_THRESHOLD = 5;
const DISCOVERY_AUTHORS = 8;

const STORY_SELECT = {
  id: true,
  authorId: true,
  authorRole: true,
  mediaType: true,
  mediaKey: true,
  text: true,
  background: true,
  tripId: true,
  productId: true,
  createdAt: true,
  expiresAt: true,
  author: { select: { id: true, name: true, avatar: true } },
} satisfies Prisma.StorySelect;

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly follows: FollowsService,
  ) {}

  async create(userId: string, dto: CreateStoryDto) {
    await this.assertCanPublishAs(userId, dto.authorRole);

    if (dto.mediaType === StoryMediaType.TEXT) {
      if (!dto.text?.trim()) {
        throw new BadRequestException('Votre story est vide.');
      }
    } else {
      if (!dto.mediaKey) {
        throw new BadRequestException('Média manquant.');
      }
      // Catégorie, propriété et existence — même contrôle que pour les vocaux.
      await this.storage.assertOwnedUpload(dto.mediaKey, userId, 'story');
    }

    if (dto.tripId && dto.productId) {
      throw new BadRequestException(
        'Une story mène vers un trajet ou un produit, pas les deux.',
      );
    }

    await this.assertOwnsTarget(userId, dto);

    return this.prisma.story.create({
      data: {
        authorId: userId,
        authorRole: dto.authorRole,
        mediaType: dto.mediaType,
        mediaKey: dto.mediaKey,
        text: dto.text?.trim(),
        background: dto.background,
        tripId: dto.tripId,
        productId: dto.productId,
        expiresAt: new Date(Date.now() + STORY_TTL_HOURS * 3600 * 1000),
      },
      select: STORY_SELECT,
    });
  }

  /** On ne publie que sous une casquette qu'on possède ET qui est approuvée. */
  private async assertCanPublishAs(
    userId: string,
    role: RoleType,
  ): Promise<void> {
    const profile =
      role === RoleType.MERCHANT
        ? await this.prisma.merchant.findUnique({
            where: { userId },
            select: { isApproved: true },
          })
        : await this.prisma.gP.findUnique({
            where: { userId },
            select: { isApproved: true },
          });

    if (!profile) {
      throw new ForbiddenException(
        role === RoleType.MERCHANT
          ? "Vous n'avez pas de boutique."
          : "Vous n'êtes pas enregistré comme GP.",
      );
    }

    if (!profile.isApproved) {
      throw new ForbiddenException(
        "Votre profil n'est pas encore approuvé par un administrateur.",
      );
    }
  }

  /**
   * La cible doit appartenir à l'auteur.
   *
   * Sans ce contrôle, n'importe qui pourrait publier une story renvoyant vers
   * le trajet d'un autre GP — et détourner sa clientèle.
   */
  private async assertOwnsTarget(
    userId: string,
    dto: CreateStoryDto,
  ): Promise<void> {
    if (dto.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: dto.tripId },
        select: { gp: { select: { userId: true } } },
      });
      if (!trip || trip.gp.userId !== userId) {
        throw new ForbiddenException("Ce trajet n'est pas le vôtre.");
      }
    }

    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { merchant: { select: { userId: true } } },
      });
      if (!product || product.merchant.userId !== userId) {
        throw new ForbiddenException("Ce produit n'est pas le vôtre.");
      }
    }
  }

  /**
   * Le bandeau de l'accueil, regroupé par auteur.
   *
   * Visibilité : les comptes suivis, plus ceux avec qui une commande est en
   * cours — on suit rarement le commerçant chez qui on vient d'acheter, mais
   * son « colis prêt, je l'apporte » nous concerne directement.
   */
  async getFeedStories(userId: string) {
    const authorIds = await this.resolveVisibleAuthors(userId);

    if (authorIds.length === 0) return [];

    const stories = await this.prisma.story.findMany({
      where: {
        authorId: { in: authorIds },
        expiresAt: { gt: new Date() },
      },
      select: {
        ...STORY_SELECT,
        views: { where: { viewerId: userId }, select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Regroupement par auteur : le bandeau montre un anneau par compte, pas
    // une vignette par story.
    const byAuthor = new Map<string, typeof stories>();
    for (const story of stories) {
      const bucket = byAuthor.get(story.authorId);
      if (bucket) bucket.push(story);
      else byAuthor.set(story.authorId, [story]);
    }

    return [...byAuthor.values()]
      .map((group) => ({
        author: group[0].author,
        authorRole: group[0].authorRole,
        stories: group.map(({ views, ...s }) => ({
          ...s,
          mediaUrl: s.mediaKey ? this.storage.publicUrl(s.mediaKey) : null,
          seen: views.length > 0,
        })),
        // L'anneau reste coloré tant qu'il reste une story non vue.
        hasUnseen: group.some((s) => s.views.length === 0),
        latestAt: group[group.length - 1].createdAt,
      }))
      // Non vues d'abord : c'est ce qu'on vient chercher.
      .sort((a, b) => {
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
        return b.latestAt.getTime() - a.latestAt.getTime();
      });
  }

  private async resolveVisibleAuthors(userId: string): Promise<string[]> {
    const { merchantIds, gpIds } = await this.follows.getFollowedIds(userId);

    const [followedUsers, orderPartners] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { merchant: { id: { in: merchantIds } } },
            { gp: { id: { in: gpIds } } },
          ],
        },
        select: { id: true },
      }),
      this.findActiveOrderPartners(userId),
    ]);

    const ids = new Set<string>([
      ...followedUsers.map((u) => u.id),
      ...orderPartners,
    ]);

    // Au démarrage, personne ne suit personne : on complète avec les comptes
    // les mieux notés pour que le bandeau ne soit pas vide dès l'installation.
    if (merchantIds.length + gpIds.length < COLD_START_THRESHOLD) {
      for (const id of await this.findDiscoveryAuthors()) ids.add(id);
    }

    ids.delete(userId); // ses propres stories sont servies à part
    return [...ids];
  }

  /** Commerçants et GP d'une commande encore en cours. */
  private async findActiveOrderPartners(userId: string): Promise<string[]> {
    const packages = await this.prisma.package.findMany({
      where: {
        order: {
          clientId: userId,
          status: {
            in: [
              OrderStatus.CONFIRMED,
              OrderStatus.COLLECTING,
              OrderStatus.IN_TRANSIT,
            ],
          },
        },
      },
      select: {
        merchant: { select: { userId: true } },
        gp: { select: { userId: true } },
      },
    });

    return packages.flatMap((p) => [p.merchant.userId, p.gp.userId]);
  }

  private async findDiscoveryAuthors(): Promise<string[]> {
    const [merchants, gps] = await Promise.all([
      this.prisma.merchant.findMany({
        where: { isApproved: true },
        select: { userId: true },
        orderBy: { rating: 'desc' },
        take: DISCOVERY_AUTHORS,
      }),
      this.prisma.gP.findMany({
        where: { isApproved: true },
        select: { userId: true },
        orderBy: { rating: 'desc' },
        take: DISCOVERY_AUTHORS,
      }),
    ]);

    return [...merchants, ...gps].map((p) => p.userId);
  }

  /** Ses propres stories, avec le décompte des vues. */
  async getMyStories(userId: string) {
    const stories = await this.prisma.story.findMany({
      where: { authorId: userId, expiresAt: { gt: new Date() } },
      select: { ...STORY_SELECT, _count: { select: { views: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return stories.map(({ _count, ...s }) => ({
      ...s,
      mediaUrl: s.mediaKey ? this.storage.publicUrl(s.mediaKey) : null,
      viewCount: _count.views,
    }));
  }

  /** Liste des spectateurs — l'auteur seul y a droit. */
  async getViewers(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { authorId: true },
    });

    if (!story) throw new NotFoundException('Story introuvable.');
    if (story.authorId !== userId) {
      throw new ForbiddenException("Cette story n'est pas la vôtre.");
    }

    return this.prisma.storyView.findMany({
      where: { storyId },
      select: {
        viewedAt: true,
        viewer: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { viewedAt: 'desc' },
    });
  }

  /** Marque une story comme vue. Idempotent. */
  async markViewed(storyId: string, userId: string): Promise<void> {
    const story = await this.prisma.story.findFirst({
      where: { id: storyId, expiresAt: { gt: new Date() } },
      select: { authorId: true },
    });

    if (!story) throw new NotFoundException('Story introuvable ou expirée.');

    // Regarder sa propre story ne compte pas comme une vue.
    if (story.authorId === userId) return;

    await this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId: userId } },
      update: {},
      create: { storyId, viewerId: userId },
    });
  }

  async remove(storyId: string, userId: string): Promise<void> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { authorId: true, mediaKey: true },
    });

    if (!story) throw new NotFoundException('Story introuvable.');
    if (story.authorId !== userId) {
      throw new ForbiddenException("Cette story n'est pas la vôtre.");
    }

    await this.prisma.story.delete({ where: { id: storyId } });
    if (story.mediaKey) await this.storage.delete(story.mediaKey);
  }

  /**
   * Purge des stories expirées.
   *
   * La correction ne dépend PAS de cet appel : toutes les lectures filtrent
   * déjà sur `expiresAt`. Il ne s'agit que de reprendre de la place, d'où
   * l'absence d'ordonnanceur pour l'instant — un appel périodique suffira.
   */
  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.story.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, mediaKey: true },
    });

    if (expired.length === 0) return 0;

    await this.prisma.story.deleteMany({
      where: { id: { in: expired.map((s) => s.id) } },
    });

    await Promise.all(
      expired
        .filter((s) => s.mediaKey)
        .map((s) => this.storage.delete(s.mediaKey!)),
    );

    return expired.length;
  }
}
