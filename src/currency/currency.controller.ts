import { Controller, Get } from '@nestjs/common';
import { CurrencyService } from './currency.service';

/**
 * Public : un visiteur doit voir les prix dans sa devise avant même de créer
 * un compte — c'est précisément ce qui lui permet de juger de l'offre.
 */
@Controller('exchange-rates')
export class CurrencyController {
  constructor(private readonly currency: CurrencyService) {}

  @Get()
  getRates() {
    return this.currency.getRates();
  }
}
