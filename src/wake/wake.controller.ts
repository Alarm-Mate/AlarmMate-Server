import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { WakeService } from './wake.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CreateWakeDto } from './dto/wake.dto';

@Controller('wake')
export class WakeController {
  constructor(private readonly wakeService: WakeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  record(@CurrentUser() user: AuthUser, @Body() dto: CreateWakeDto) {
    return this.wakeService.recordWake(user.userId, dto);
  }
}
