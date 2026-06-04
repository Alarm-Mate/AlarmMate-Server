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
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { AlarmType, LocationTrigger } from '@prisma/client';

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
