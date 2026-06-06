import { Module } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { LastTransitService } from './last-transit.service';
import { TransitRefineService } from './transit-refine.service';

@Module({
  controllers: [PlacesController],
  providers: [PlacesService, LastTransitService, TransitRefineService],
  exports: [LastTransitService, PlacesService, TransitRefineService],
})
export class TransitModule {}
