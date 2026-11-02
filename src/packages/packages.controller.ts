import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import {
  DeliverPackageDto,
  DropOffPackageDto,
  ReceivePackageDto,
  RefusePackageDto,
} from './dto/package-action.dto';
import { PackagesService } from './packages.service';

@UseGuards(AuthGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get('gp')
  listForGp(
    @CurrentUser() user: SessionUser,
    @Query('tripId') tripId?: string,
  ) {
    return this.packagesService.listForGp(user.id, tripId);
  }

  @Get('merchant')
  listForMerchant(@CurrentUser() user: SessionUser) {
    return this.packagesService.listForMerchant(user.id);
  }

  @Patch(':id/drop-off')
  dropOff(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: DropOffPackageDto,
  ) {
    return this.packagesService.dropOff(id, user.id, dto);
  }

  @Patch(':id/receive')
  receive(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ReceivePackageDto,
  ) {
    return this.packagesService.receive(id, user.id, dto);
  }

  @Patch(':id/deliver')
  deliver(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: DeliverPackageDto,
  ) {
    return this.packagesService.deliver(id, user.id, dto);
  }

  @Patch(':id/refuse')
  refuse(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: RefusePackageDto,
  ) {
    return this.packagesService.refuse(id, user.id, dto);
  }
}
