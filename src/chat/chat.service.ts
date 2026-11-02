import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatKind, Message, MessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, avatar: true } },
} satisfies Prisma.MessageInclude;

export type MessageWithSender = Prisma.MessageGetPayload<{
  include: typeof MESSAGE_INCLUDE;
}>;

/** Message enrichi d'une URL d'écoute temporaire pour les vocaux. */
export type DeliverableMessage = MessageWithSender & {
  playbackUrl?: string;
};

const FILE_MESSAGE_TYPES: MessageType[] = [
  MessageType.IMAGE,
  MessageType.VOICE,
  MessageType.FILE,
];

/** Casquette affichable d'un interlocuteur. `null` pour un simple client. */
export type CounterpartRole = 'merchant' | 'gp';

/**
 * Détermine sous quelle casquette présenter un interlocuteur.
 *
 * Un compte peut être les deux à la fois. On privilégie alors « boutique » :
 * c'est le rôle qui porte un NOM propre — l'enseigne — donc celui qui rend la
 * conversation identifiable dans une liste. Les profils non approuvés sont
 * ignorés : afficher une pastille de boutique pour un dossier encore en
 * attente laisserait croire à une validation qui n'a pas eu lieu.
 */
function resolveRole(user: {
  merchant: { isApproved: boolean } | null;
  gp: { isApproved: boolean } | null;
}): CounterpartRole | null {
  if (user.merchant?.isApproved) return 'merchant';
  if (user.gp?.isApproved) return 'gp';
  return null;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Participants légitimes d'une conversation.
   *
   * L'appartenance se lit désormais dans `ChatMember`, et non plus en
   * remontant la commande. C'est ce qui permet de traiter d'une seule façon
   * la conversation de commande et la conversation directe — cette dernière
   * n'ayant aucune commande d'où déduire quoi que ce soit.
   *
   * Effet de bord bienvenu : un commerçant retiré d'une commande garde accès
   * à l'historique qu'il a vécu, au lieu d'en être éjecté rétroactivement.
   */
  async assertParticipant(
    chatId: string,
    userId: string,
  ): Promise<string | null> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        orderId: true,
        members: { where: { userId }, select: { id: true } },
      },
    });

    if (!chat) {
      throw new NotFoundException('Conversation introuvable.');
    }

    if (chat.members.length === 0) {
      throw new ForbiddenException(
        "Vous ne participez pas à cette conversation.",
      );
    }

    return chat.orderId;
  }

  /** Résout l'identifiant de conversation attaché à une commande. */
  async getChatIdForOrder(orderId: string, userId: string): Promise<string> {
    const chat = await this.prisma.chat.findUnique({
      where: { orderId },
      select: { id: true },
    });

    if (!chat) {
      throw new NotFoundException('Conversation introuvable.');
    }

    await this.assertParticipant(chat.id, userId);
    return chat.id;
  }

  /**
   * Ouvre — ou retrouve — la conversation directe entre deux personnes.
   *
   * Idempotent par nécessité : le bouton « Contacter » d'une fiche GP est
   * appuyé plusieurs fois, et chaque appui ne doit pas créer un fil de plus.
   * Comme Prisma ne sait pas exprimer « exactement ces deux membres », on
   * cherche les conversations directes de l'appelant puis on filtre côté
   * serveur — leur nombre reste de l'ordre de la dizaine.
   */
  async openDirect(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException(
        'Vous ne pouvez pas démarrer une conversation avec vous-même.',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const existing = await this.prisma.chat.findFirst({
      where: {
        kind: ChatKind.DIRECT,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      select: { id: true, members: { select: { userId: true } } },
    });

    // Le filtre `some`/`some` accepterait aussi un fil à trois participants
    // contenant les deux : on exige donc un tête-à-tête strict.
    if (existing && existing.members.length === 2) {
      return { chatId: existing.id, created: false };
    }

    const chat = await this.prisma.chat.create({
      data: {
        kind: ChatKind.DIRECT,
        members: { create: [{ userId }, { userId: targetUserId }] },
      },
      select: { id: true },
    });

    return { chatId: chat.id, created: true };
  }

  /**
   * Liste des conversations, la plus récente en tête.
   *
   * Le tri s'appuie sur `lastMessageAt`, dénormalisé sur la conversation :
   * agréger les messages à chaque affichage coûterait un balayage par fil.
   * Une conversation sans message garde `lastMessageAt` à null et retombe sur
   * sa date de création — sinon un fil tout juste ouvert serait invisible.
   */
  async listConversations(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: { members: { some: { userId } } },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        kind: true,
        orderId: true,
        lastMessageAt: true,
        createdAt: true,
        members: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                // La casquette de l'interlocuteur, pour l'afficher dans la
                // liste. Sans elle, « Awa Diop » et « Chez Awa Couture » sont
                // indiscernables — or on n'écrit pas la même chose à une
                // boutique qu'à un transporteur.
                merchant: { select: { shopName: true, isApproved: true } },
                gp: { select: { isApproved: true } },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            type: true,
            content: true,
            duration: true,
            senderId: true,
            createdAt: true,
          },
        },
      },
    });

    if (chats.length === 0) return [];

    // Un seul groupBy pour tous les compteurs de non-lus, plutôt qu'un count
    // par conversation : la liste des messages est la table la plus volumineuse
    // de la base, et l'écran s'ouvre à chaque passage sur l'onglet.
    const unreadRows = await this.prisma.message.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: chats.map((c) => c.id) },
        senderId: { not: userId },
        isRead: false,
      },
      _count: true,
      orderBy: { chatId: 'asc' },
    });

    const unreadByChat = new Map(
      unreadRows.map((row) => [row.chatId, row._count]),
    );

    return chats.map((chat) => {
      const others = chat.members.filter((m) => m.userId !== userId);
      const last = chat.messages[0] ?? null;

      const counterpart = others[0]?.user ?? null;
      const role = counterpart ? resolveRole(counterpart) : null;

      return {
        id: chat.id,
        kind: chat.kind,
        orderId: chat.orderId,
        // Une conversation de commande réunit plusieurs interlocuteurs : elle
        // est identifiée par la commande, pas par une personne.
        title:
          chat.kind === ChatKind.ORDER
            ? `Commande #${(chat.orderId ?? chat.id).slice(-6).toUpperCase()}`
            : // Pour un commerçant, l'enseigne prime sur l'état civil : c'est
              // sous ce nom qu'il publie, donc celui que le client reconnaît.
              // Conditionné au rôle résolu, sinon une boutique non approuvée
              // porterait son enseigne sans la pastille qui va avec.
              (role === 'merchant'
                ? (counterpart?.merchant?.shopName ?? counterpart.name)
                : (counterpart?.name ?? 'Conversation')),
        avatar: chat.kind === ChatKind.ORDER ? null : (counterpart?.avatar ?? null),
        // null pour une conversation de commande (plusieurs rôles autour de la
        // table) et pour un simple client, qui n'en a aucun à afficher.
        counterpartRole: chat.kind === ChatKind.ORDER ? null : role,
        participants: others.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          avatar: m.user.avatar,
        })),
        lastMessage: last
          ? {
              // Le résumé est composé ici : le client afficherait sinon un
              // libellé vide pour un vocal ou une image, dont `content` est nul.
              preview: this.previewOf(last),
              isMine: last.senderId === userId,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unreadCount: unreadByChat.get(chat.id) ?? 0,
        updatedAt: (chat.lastMessageAt ?? chat.createdAt).toISOString(),
      };
    });
  }

  private previewOf(message: {
    type: MessageType;
    content: string | null;
    duration: number | null;
  }): string {
    switch (message.type) {
      case MessageType.VOICE: {
        const seconds = message.duration ?? 0;
        const mm = Math.floor(seconds / 60);
        const ss = String(seconds % 60).padStart(2, '0');
        return `Message vocal · ${mm}:${ss}`;
      }
      case MessageType.IMAGE:
        return 'Photo';
      case MessageType.FILE:
        return 'Fichier';
      default:
        return message.content ?? '';
    }
  }

  async sendMessage(
    chatId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<DeliverableMessage> {
    await this.assertParticipant(chatId, senderId);

    const type = dto.type ?? MessageType.TEXT;

    if (type === MessageType.TEXT) {
      if (!dto.content?.trim()) {
        throw new BadRequestException('Message vide.');
      }
    } else if (FILE_MESSAGE_TYPES.includes(type)) {
      if (!dto.fileKey) {
        throw new BadRequestException('Fichier manquant.');
      }

      // Catégorie + propriété + existence. Le contrôle de catégorie compte
      // autant que les autres : sans lui, une clé `kyc/` pourrait être
      // diffusée dans une conversation comme s'il s'agissait d'un vocal.
      await this.storage.assertOwnedUpload(
        dto.fileKey,
        senderId,
        type === MessageType.VOICE ? 'voice' : 'chat',
      );

      if (type === MessageType.VOICE && !dto.duration) {
        throw new BadRequestException(
          'La durée du message vocal est obligatoire.',
        );
      }
    }

    // Transaction : `lastMessageAt` est la clé de tri de la liste des
    // conversations. Écrit séparément, un échec le laisserait en retard et la
    // conversation tomberait au fond de la liste malgré un message frais.
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId,
          type,
          content: type === MessageType.TEXT ? dto.content?.trim() : dto.content,
          fileUrl: dto.fileKey,
          duration: dto.duration,
        },
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return this.withPlaybackUrl(message);
  }

  /**
   * Historique en pagination par curseur, renvoyé du plus ancien au plus
   * récent pour être affiché tel quel.
   */
  async listMessages(
    chatId: string,
    userId: string,
    dto: ListMessagesDto,
  ): Promise<DeliverableMessage[]> {
    await this.assertParticipant(chatId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...(dto.before ? { createdAt: { lt: new Date(dto.before) } } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: dto.limit,
    });

    return Promise.all(messages.reverse().map((m) => this.withPlaybackUrl(m)));
  }

  /** Marque comme lus les messages reçus des autres participants. */
  async markAsRead(chatId: string, userId: string): Promise<number> {
    await this.assertParticipant(chatId, userId);

    const { count } = await this.prisma.message.updateMany({
      where: { chatId, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });

    return count;
  }

  async countUnread(chatId: string, userId: string): Promise<number> {
    await this.assertParticipant(chatId, userId);

    return this.prisma.message.count({
      where: { chatId, senderId: { not: userId }, isRead: false },
    });
  }

  /**
   * Les fichiers de conversation sont dans le bucket privé : on joint une URL
   * de lecture à durée limitée plutôt que d'exposer le stockage.
   */
  private async withPlaybackUrl(
    message: MessageWithSender,
  ): Promise<DeliverableMessage> {
    if (!message.fileUrl || !FILE_MESSAGE_TYPES.includes(message.type)) {
      return message;
    }

    return {
      ...message,
      playbackUrl: await this.storage.presignDownload(message.fileUrl),
    };
  }
}
