import { IsOptional, IsString } from 'class-validator';

export class CreateWakeDto {
  @IsString()
  alarmId!: string;

  @IsOptional()
  @IsString()
  wokeAt?: string;
}
