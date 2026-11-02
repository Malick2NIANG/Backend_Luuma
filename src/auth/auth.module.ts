import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OtpRateLimitGuard } from './otp-rate-limit.guard';

@Module({
  controllers: [AuthController],
  // Fourni ici, donc instancié UNE fois : le compteur d'envois est porté par
  // l'instance, et une garde recréée à chaque requête ne limiterait rien.
  providers: [OtpRateLimitGuard],
})
export class AuthModule {}
