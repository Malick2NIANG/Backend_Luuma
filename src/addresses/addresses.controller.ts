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
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/**
 * Carnet d'adresses — strictement personnel.
 *
 * Aucune route ne prend d'identifiant d'utilisateur : il vient toujours de la
 * session. Une adresse postale complète suffit à se présenter chez quelqu'un,
 * c'est l'une des données les plus sensibles de la plateforme.
 */
@UseGuards(AuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.addresses.listOwn(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateAddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.addresses.remove(id, user.id);
  }
}
