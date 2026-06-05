import { Controller, Get, Query } from '@nestjs/common';
import { PlacesService } from './places.service';
import { PlaceSearchDto } from './dto/transit.dto';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  /** GET /places/search?q=&lat=&lng= — 키워드 장소 검색(거리순). */
  @Get('search')
  search(@Query() dto: PlaceSearchDto) {
    const lat = dto.lat !== undefined ? Number(dto.lat) : undefined;
    const lng = dto.lng !== undefined ? Number(dto.lng) : undefined;
    return this.placesService.search(
      dto.q,
      Number.isFinite(lat) ? lat : undefined,
      Number.isFinite(lng) ? lng : undefined,
    );
  }
}
