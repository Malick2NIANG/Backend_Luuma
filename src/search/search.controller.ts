import { Controller, Get, Query } from '@nestjs/common';
import { SearchProductsDto, SuggestDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * Public : chercher est le premier geste d'un visiteur, bien avant de créer
 * un compte. Aucun de ces points d'entrée ne dépend de l'utilisateur.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('products')
  searchProducts(@Query() dto: SearchProductsDto) {
    return this.search.searchProducts(dto);
  }

  @Get('merchants')
  searchMerchants(@Query('q') q?: string) {
    return this.search.searchMerchants(q);
  }

  /** Alimente la liste qui s'affiche pendant la frappe. */
  @Get('suggest')
  suggest(@Query() dto: SuggestDto) {
    return this.search.suggest(dto);
  }
}
