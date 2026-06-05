import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class PlaceSearchDto {
  @IsString()
  @MinLength(1)
  q!: string;

  // 쿼리스트링이라 문자열로 받고 서비스에서 파싱.
  @IsOptional()
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  lng?: string;
}

export class CreateLastTransitDto {
  @IsString()
  @MinLength(1)
  originName!: string;

  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsString()
  @MinLength(1)
  destName!: string;

  @IsLatitude()
  destLat!: number;

  @IsLongitude()
  destLng!: number;
}
