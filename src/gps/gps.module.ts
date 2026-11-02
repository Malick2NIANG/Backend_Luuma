import { Module } from '@nestjs/common';
import { GpsController } from './gps.controller';
import { GpsService } from './gps.service';

@Module({
  controllers: [GpsController],
  providers: [GpsService],
  // TripsService s'appuie sur getOwnGpOrThrow() : un dossier en attente
  // prépare ses trajets, invisibles jusqu'à validation.
  exports: [GpsService],
})
export class GpsModule {}
