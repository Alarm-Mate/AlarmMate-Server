import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SendReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;

  @IsOptional()
  @IsString()
  @IsIn(['PROVOKE', 'CHEER'])
  kind?: 'PROVOKE' | 'CHEER';
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nickname?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsOptional()
  @IsString()
  wakeGoalTime?: string;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}

export class UpdateOneSignalDto {
  @IsString()
  oneSignalSubscriptionId!: string;
}

export class SearchUsersDto {
  @IsString()
  @MinLength(1)
  nickname!: string;

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

export class GrassQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  weeks?: number;
}
