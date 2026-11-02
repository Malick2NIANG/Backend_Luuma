import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Une exception non prévue ne doit pas exposer sa cause au client : le
    // détail va dans les logs du serveur, pas dans la réponse. Le texte est en
    // français parce qu'il peut finir affiché tel quel dans l'application.
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Une erreur interne est survenue.';

    /**
     * Les erreurs non prévues sont journalisées AVEC leur pile.
     *
     * Sans cela, une 500 partait au client et ne laissait aucune trace côté
     * serveur : on apprenait l'existence du bug par une capture d'écran, sans
     * le moindre moyen de le situer. Les erreurs HTTP délibérées — un 403, un
     * 404 — ne sont pas journalisées : elles sont le fonctionnement normal de
     * l'application, et les écrire noierait les vraies pannes.
     */
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `${request.method} ${request.url} — ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(statusCode).json({
      statusCode,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
