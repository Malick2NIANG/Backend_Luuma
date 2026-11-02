import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { MarketingConsentDto } from './dto/marketing-consent.dto';
import { MeService } from './me.service';

@UseGuards(AuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /**
   * Identité et capacités du compte connecté.
   *
   * Appelé à l'ouverture de l'application et après toute action qui change les
   * droits — création de boutique, vérification d'email, approbation d'un
   * dossier. C'est la seule source à laquelle l'interface se fie pour décider
   * ce qu'elle affiche.
   */
  @Get()
  getProfile(@CurrentUser() user: SessionUser) {
    return this.me.getProfile(user.id);
  }

  /**
   * Acceptation des conditions générales.
   *
   * Appelé par l'écran bloquant affiché à la première ouverture, et de nouveau
   * à chaque changement de version. C'est ici — et nulle part ailleurs — que
   * `termsAcceptedAt` est écrit.
   */
  @Post('accept-terms')
  acceptTerms(@CurrentUser() user: SessionUser, @Body() dto: AcceptTermsDto) {
    return this.me.acceptTerms(user.id, dto.version, dto.marketingConsent);
  }

  /**
   * Accord — ou retrait d'accord — pour les communications commerciales.
   *
   * Le retrait doit être aussi simple que l'accord : c'est la même route, avec
   * `accepted: false`. Un consentement qu'on ne peut pas retirer d'un geste
   * n'en est pas un.
   */
  @Post('marketing-consent')
  setMarketingConsent(
    @CurrentUser() user: SessionUser,
    @Body() dto: MarketingConsentDto,
  ) {
    return this.me.setMarketingConsent(user.id, dto.accepted);
  }
}
