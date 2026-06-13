import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateWakeDto {
  @IsString()
  alarmId!: string;

  // 클라이언트가 보내는 기상 시각은 ISO8601만 허용(잘못된 문자열로 인한 500/기록 위조 방지).
  @IsOptional()
  @IsISO8601()
  wokeAt?: string;
}
