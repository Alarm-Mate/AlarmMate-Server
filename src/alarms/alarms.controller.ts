import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CreateAlarmDto, UpdateAlarmDto } from './dto/alarms.dto';

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.alarmsService.list(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAlarmDto) {
    return this.alarmsService.create(user.userId, dto);
  }

  @Patch(':alarmId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('alarmId') alarmId: string,
    @Body() dto: UpdateAlarmDto,
  ) {
    return this.alarmsService.update(user.userId, alarmId, dto);
  }

  @Delete(':alarmId')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('alarmId') alarmId: string) {
    return this.alarmsService.remove(user.userId, alarmId);
  }

  @Patch(':alarmId/toggle')
  toggle(@CurrentUser() user: AuthUser, @Param('alarmId') alarmId: string) {
    return this.alarmsService.toggle(user.userId, alarmId);
  }
}
