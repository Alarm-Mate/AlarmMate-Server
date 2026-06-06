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
import {
  CreateAppointmentDto,
  CreateLastTransitDto,
} from '../transit/dto/transit.dto';

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

  /** 막차 알람: 출발지·목적지 → 막차 시각 계산 → 알람 생성. */
  @Post('last-transit')
  @HttpCode(HttpStatus.CREATED)
  createLastTransit(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLastTransitDto,
  ) {
    return this.alarmsService.createLastTransit(user.userId, dto);
  }

  /** 약속 알람: 약속시간·준비시간·장소 → 이동시간 계산 → 알람 생성. */
  @Post('appointment')
  @HttpCode(HttpStatus.CREATED)
  createAppointment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.alarmsService.createAppointment(user.userId, dto);
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
