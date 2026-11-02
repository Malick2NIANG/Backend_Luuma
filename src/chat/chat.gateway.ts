import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { auth } from '../auth/auth.config';
import { ChatService, DeliverableMessage } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

/** Socket authentifié : userId posé à la connexion. */
interface AuthedSocket extends Socket {
  data: { userId?: string };
}

function roomFor(chatId: string): string {
  return `chat:${chatId}`;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly chat: ChatService) {}

  /**
   * Diffuse un message envoyé hors WebSocket (repli REST).
   *
   * Sans cela, un message posté en HTTP parce que la WebSocket était coupée
   * n'apparaîtrait chez les autres participants qu'au prochain rechargement.
   */
  broadcastMessage(chatId: string, message: DeliverableMessage): void {
    this.server?.to(roomFor(chatId)).emit('chat:message', message);
  }

  /**
   * Authentification en middleware, et non dans handleConnection.
   *
   * `handleConnection` est asynchrone, mais Socket.IO n'attend pas sa
   * promesse : le client reçoit `connect` dès la fin du transport, donc un
   * client qui émet immédiatement après (ce que fait tout mobile qui rejoint
   * automatiquement une conversation) peut passer avant que `data.userId` ne
   * soit renseigné, et se voir refuser avec un token pourtant valide.
   *
   * Un middleware, lui, bloque réellement : `connect` n'est livré qu'une fois
   * `next()` appelé. L'échec devient aussi un `connect_error` explicite côté
   * client, qui peut alors distinguer un token invalide d'une coupure réseau.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      // Le token passe par le handshake `auth` : React Native ne permet pas
      // de fixer un en-tête arbitraire sur une WebSocket.
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace(/^Bearer /, '');

      if (!token) {
        next(new Error('Non authentifié.'));
        return;
      }

      auth.api
        .getSession({
          headers: new Headers({ authorization: `Bearer ${token}` }),
        })
        .then((session) => {
          if (!session) {
            next(new Error('Session invalide ou expirée.'));
            return;
          }

          (socket as AuthedSocket).data.userId = session.user.id;
          next();
        })
        .catch((error: unknown) => {
          this.logger.warn(`Connexion refusée: ${String(error)}`);
          next(new Error('Authentification impossible.'));
        });
    });
  }

  /**
   * À ce stade le middleware a déjà validé la session : `userId` est garanti.
   * On confirme au client qu'il peut émettre — pratique pour un mobile qui
   * préfère attendre un accusé plutôt que de se fier au seul `connect`.
   */
  handleConnection(client: AuthedSocket): void {
    client.emit('chat:ready', { userId: client.data.userId });
  }

  handleDisconnect(client: AuthedSocket): void {
    this.logger.debug(`Déconnexion: ${client.data.userId ?? 'anonyme'}`);
  }

  private userIdOf(client: AuthedSocket): string {
    const userId = client.data.userId;
    if (!userId) {
      throw new WsException('Non authentifié.');
    }
    return userId;
  }

  /** Rejoint la conversation d'une commande, après contrôle d'accès. */
  @SubscribeMessage('chat:join')
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId: string },
  ) {
    const userId = this.userIdOf(client);

    try {
      await this.chat.assertParticipant(body.chatId, userId);
    } catch (error) {
      throw new WsException(
        error instanceof Error ? error.message : 'Accès refusé.',
      );
    }

    await client.join(roomFor(body.chatId));

    return {
      chatId: body.chatId,
      unread: await this.chat.countUnread(body.chatId, userId),
    };
  }

  @SubscribeMessage('chat:leave')
  async leave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId: string },
  ) {
    await client.leave(roomFor(body.chatId));
    return { chatId: body.chatId };
  }

  /**
   * Envoie un message (texte ou vocal).
   *
   * Diffusé à toute la salle, expéditeur compris : le client peut ainsi
   * remplacer son message optimiste par la version persistée, avec son vrai
   * identifiant et son horodatage serveur.
   */
  @SubscribeMessage('chat:send')
  async send(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId: string } & SendMessageDto,
  ) {
    const userId = this.userIdOf(client);
    const { chatId, ...dto } = body;

    try {
      const message = await this.chat.sendMessage(chatId, userId, dto);
      this.server.to(roomFor(chatId)).emit('chat:message', message);
      return message;
    } catch (error) {
      throw new WsException(
        error instanceof Error ? error.message : "Envoi impossible.",
      );
    }
  }

  @SubscribeMessage('chat:read')
  async read(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId: string },
  ) {
    const userId = this.userIdOf(client);
    const count = await this.chat.markAsRead(body.chatId, userId);

    client.to(roomFor(body.chatId)).emit('chat:read', { chatId: body.chatId, userId });
    return { count };
  }

  /**
   * Indicateur de saisie / d'enregistrement vocal.
   * Volontairement non persisté : c'est un état éphémère.
   */
  @SubscribeMessage('chat:typing')
  typing(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { chatId: string; isTyping: boolean; isRecording?: boolean },
  ) {
    const userId = this.userIdOf(client);

    client.to(roomFor(body.chatId)).emit('chat:typing', {
      chatId: body.chatId,
      userId,
      isTyping: body.isTyping,
      isRecording: body.isRecording ?? false,
    });
  }
}
