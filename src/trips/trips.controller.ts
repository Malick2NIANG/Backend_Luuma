import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import type { SessionUser } from '../auth/auth.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { CreateTripDto } from './dto/create-trip.dto';
import { SearchTripDto } from './dto/search-trip.dto';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @UseGuards(AuthGuard)
  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateTripDto) {
    return this.tripsService.create(user.id, dto);
  }

  @Get('search')
  search(@Query() dto: SearchTripDto) {
    return this.tripsService.search(dto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.tripsService.findById(id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body('status', new ParseEnumPipe(TripStatus)) status: TripStatus,
  ) {
    return this.tripsService.updateStatus(id, user.id, status);
  }
}
