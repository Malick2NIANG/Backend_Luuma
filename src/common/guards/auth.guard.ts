import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { Request } from 'express';
import { auth } from '../../auth/auth.config';

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw new UnauthorizedException('Missing or invalid session');
    }

    request.user = session.user;
    // La session est exposée en plus de son porteur : l'élévation vers
    // l'administration s'accorde à un appareil précis, pas à un compte.
    request.session = session.session;

    return true;
  }
}
