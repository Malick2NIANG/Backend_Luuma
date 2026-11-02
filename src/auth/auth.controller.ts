import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth } from './auth.config';
import { OtpRateLimitGuard } from './otp-rate-limit.guard';

/**
 * La garde est posée sur l'attrape-tout et non sur une route dédiée : les
 * points d'entrée d'authentification sont ceux de better-auth, et l'application
 * les appelle directement. Une limite placée sur un endpoint maison à nous se
 * contournerait en visant le sien.
 */
@UseGuards(OtpRateLimitGuard)
@Controller('api/auth')
export class AuthController {
  private readonly handler = toNodeHandler(auth);

  @All('*')
  async handleAuth(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handler(req, res);
  }
}
