import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { VerifiedEmailGuard } from '../common/guards/verified-email.guard';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { ListMerchantsDto } from './dto/list-merchants.dto';
import { ListOwnProductsDto } from './dto/list-own-products.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  // Ouvrir une boutique engage une identité commerciale : email vérifié exigé.
  @UseGuards(AuthGuard, VerifiedEmailGuard)
  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateMerchantDto) {
    return this.merchantsService.create(user.id, dto);
  }

  // Déclaré avant `:id` pour que "me" ne soit pas capturé comme un id.
  @UseGuards(AuthGuard)
  @Get('me')
  findOwn(@CurrentUser() user: SessionUser) {
    return this.merchantsService.findOwn(user.id);
  }

  @UseGuards(AuthGuard)
  @Patch('me')
  updateOwn(@CurrentUser() user: SessionUser, @Body() dto: UpdateMerchantDto) {
    return this.merchantsService.updateOwn(user.id, dto);
  }

  /**
   * Le catalogue du commerçant, indisponibles compris.
   *
   * Placé sous `merchants/me` et non sous `products` : la ressource ici est la
   * boutique de l'appelant, et c'est elle qui détermine ce qu'il a le droit
   * de voir.
   */
  @UseGuards(AuthGuard)
  @Get('me/products')
  listOwnProducts(
    @CurrentUser() user: SessionUser,
    @Query() dto: ListOwnProductsDto,
  ) {
    return this.merchantsService.listOwnProducts(user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Get('me/stats')
  getOwnStats(@CurrentUser() user: SessionUser) {
    return this.merchantsService.getOwnStats(user.id);
  }

  @Get()
  list(@Query() dto: ListMerchantsDto) {
    return this.merchantsService.list(dto);
  }

  // Public, mais lit la session si elle existe : `isFollowedByMe` en dépend.
  @UseGuards(OptionalAuthGuard)
  @Get(':id')
  findById(
    @Param('id') id: string,
    @CurrentUser() viewer: SessionUser | undefined,
  ) {
    return this.merchantsService.findById(id, viewer?.id);
  }
}
