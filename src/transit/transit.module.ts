import { Module } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { LastTransitService } from './last-transit.service';

@Module({
  controllers: [PlacesController],
  providers: [PlacesService, LastTransitService],
  exports: [LastTransitService, PlacesService],
})
export class TransitModule {}
