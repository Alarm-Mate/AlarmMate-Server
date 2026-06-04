import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SoundsService } from './sounds.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CreateSoundDto } from './dto/sounds.dto';

@Controller('sounds')
export class SoundsController {
  constructor(private readonly soundsService: SoundsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.soundsService.list(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSoundDto) {
    return this.soundsService.create(user.userId, dto);
  }

  @Delete(':soundId')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('soundId') soundId: string) {
    return this.soundsService.remove(user.userId, soundId);
  }
}
