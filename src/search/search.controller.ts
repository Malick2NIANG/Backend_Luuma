import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { InterestsService } from '../interests/interests.service';
import { SearchProductsDto, SuggestDto } from './dto/search.dto';
import { SearchService } from './search.service';

/**
 * Public : chercher est le premier geste d'un visiteur, bien avant de créer
 * un compte. Aucun de ces points d'entrée ne dépend de l'utilisateur.
 */
@UseGuards(OptionalAuthGuard)
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly interests: InterestsService,
  ) {}

  /**
   * Recherche de produits.
   *
   * Pour un utilisateur connecté, la PREMIÈRE page d'une recherche qui porte
   * sur quelque chose (un terme ou une catégorie) laisse une trace : les
   * catégories trouvées, qui remonteront dans son fil. Les pages suivantes
   * ne comptent pas — faire défiler n'est pas chercher à nouveau.
   */
  @Get('products')
  async searchProducts(
    @Query() dto: SearchProductsDto,
    @CurrentUser() user: SessionUser | undefined,
  ) {
    const result = await this.search.searchProducts(dto);

    const terme = dto.q?.trim();
    if (user && dto.page === 1 && (terme || dto.category)) {
      const categories = dto.category
        ? [dto.category]
        : result.data.slice(0, 5).map((p) => p.category);
      this.interests.recordSearch(user.id, terme, categories);
    }

    return result;
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
