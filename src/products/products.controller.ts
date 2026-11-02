import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.id, dto);
  }

  // `GET /api/products/search` a été retiré au profit de
  // `GET /api/search/products` : ce dernier apporte le classement par
  // pertinence, la tolérance aux accents et aux fautes, et les filtres poids
  // et note. L'ancien ne faisait qu'une correspondance de sous-chaîne triée
  // par date — il aurait ignoré « brode » comme « bazan ».

  // Public, mais lit la session si elle existe : `isFavorited` en dépend.
  @UseGuards(OptionalAuthGuard)
  @Get(':id')
  findById(
    @Param('id') id: string,
    @CurrentUser() viewer: SessionUser | undefined,
  ) {
    return this.productsService.findById(id, viewer?.id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.productsService.remove(id, user.id);
  }

  // --- Déclinaisons ------------------------------------------------------
  // Sous-ressource plutôt que remplacement en bloc via PATCH /products/:id :
  // un remplacement supprimerait des déclinaisons référencées par des
  // commandes en cours. Ici chacune se crée, se corrige ou se retire seule.

  @UseGuards(AuthGuard)
  @Post(':id/variants')
  addVariant(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.addVariant(id, user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Patch('variants/:variantId')
  updateVariant(
    @Param('variantId') variantId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(variantId, user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Delete('variants/:variantId')
  removeVariant(
    @Param('variantId') variantId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.productsService.removeVariant(variantId, user.id);
  }
}
