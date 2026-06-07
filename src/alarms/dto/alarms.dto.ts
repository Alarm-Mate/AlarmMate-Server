import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
import { AlarmType, LocationTrigger } from '@prisma/client';

// HH:mm (00:00~23:59)
export const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export type CreatableAlarmType =
  | typeof AlarmType.PERSONAL
  | typeof AlarmType.LOCATION;

export class CreateAlarmDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsEnum(AlarmType)
  type?: CreatableAlarmType;

  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'time must be HH:mm' })
  time?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  @IsOptional()
  @IsBoolean()
  vibration?: boolean;

  @IsOptional()
  @IsString()
  soundId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  placeName?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  radius?: number;

  @IsOptional()
  @IsEnum(LocationTrigger)
  locationTrigger?: LocationTrigger;
}

export class UpdateAlarmDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'time must be HH:mm' })
  time?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  vibration?: boolean;

  @IsOptional()
  @IsString()
  soundId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  placeName?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  radius?: number;

  @IsOptional()
  @IsEnum(LocationTrigger)
  locationTrigger?: LocationTrigger;
}
