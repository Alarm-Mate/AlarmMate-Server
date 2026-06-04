import { IsString, MinLength } from 'class-validator';

export class CreateSoundDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  url!: string;
}
