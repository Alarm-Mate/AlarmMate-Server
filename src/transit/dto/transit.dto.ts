import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
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

export class CreateAppointmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'appointmentTime must be HH:mm' })
  appointmentTime!: string;

  @IsInt()
  @Min(0)
  @Max(1440)
  prepMinutes!: number;

  @IsBoolean()
  vibration!: boolean;

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
