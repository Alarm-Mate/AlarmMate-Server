import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(HHMM_REGEX, { message: 'alarmTime must be HH:mm' })
  alarmTime!: string;

  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberUserIds?: string[];

  @IsOptional()
  @IsBoolean()
  isOneTime?: boolean;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'alarmTime must be HH:mm' })
  alarmTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];
}

export class InviteDto {
  @IsString()
  userId!: string;
}

export class TransferOwnerDto {
  @IsString()
  newOwnerId!: string;
}

export class WakeStatusQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

export class CursorOnlyDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MemberSettingsDto {
  @IsOptional()
  @IsBoolean()
  vibration?: boolean;

  @IsOptional()
  @IsString()
  soundId?: string;
}

export class ToggleMemberDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
