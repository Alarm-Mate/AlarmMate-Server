import { Injectable } from '@nestjs/common';
import { Alarm, AlarmType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { CreateAlarmDto, UpdateAlarmDto } from './dto/alarms.dto';

interface AlarmView {
  id: string;
  name: string;
  time: string;
  days: number[];
  isEnabled: boolean;
  vibration: boolean;
  soundId: string | null;
  type: AlarmType;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AlarmsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AlarmView[]> {
    const alarms = await this.prisma.alarm.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return alarms.map((a) => this.toView(a));
  }

  async create(userId: string, dto: CreateAlarmDto): Promise<AlarmView> {
    const alarm = await this.prisma.alarm.create({
      data: {
        userId,
        name: dto.name,
        time: dto.time,
        days: dto.days,
        vibration: dto.vibration ?? true,
        soundId: dto.soundId ?? null,
        type: AlarmType.PERSONAL,
      },
    });
    return this.toView(alarm);
  }

  async update(
    userId: string,
    alarmId: string,
    dto: UpdateAlarmDto,
  ): Promise<AlarmView> {
    await this.ensureOwned(userId, alarmId);
    const alarm = await this.prisma.alarm.update({
      where: { id: alarmId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.time !== undefined ? { time: dto.time } : {}),
        ...(dto.days !== undefined ? { days: dto.days } : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.vibration !== undefined ? { vibration: dto.vibration } : {}),
        ...(dto.soundId !== undefined ? { soundId: dto.soundId } : {}),
      },
    });
    return this.toView(alarm);
  }

  async remove(userId: string, alarmId: string): Promise<{ deleted: boolean }> {
    await this.ensureOwned(userId, alarmId);
    await this.prisma.alarm.delete({ where: { id: alarmId } });
    return { deleted: true };
  }

  async toggle(userId: string, alarmId: string): Promise<AlarmView> {
    const alarm = await this.ensureOwned(userId, alarmId);
    const updated = await this.prisma.alarm.update({
      where: { id: alarmId },
      data: { isEnabled: !alarm.isEnabled },
    });
    return this.toView(updated);
  }

  private async ensureOwned(userId: string, alarmId: string): Promise<Alarm> {
    const alarm = await this.prisma.alarm.findUnique({
      where: { id: alarmId },
    });
    if (!alarm) {
      throw new AppException(ErrorCode.ALARM_NOT_FOUND);
    }
    if (alarm.userId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN);
    }
    return alarm;
  }

  private toView(alarm: Alarm): AlarmView {
    return {
      id: alarm.id,
      name: alarm.name,
      time: alarm.time,
      days: alarm.days,
      isEnabled: alarm.isEnabled,
      vibration: alarm.vibration,
      soundId: alarm.soundId,
      type: alarm.type,
      groupId: alarm.groupId,
      createdAt: alarm.createdAt.toISOString(),
      updatedAt: alarm.updatedAt.toISOString(),
    };
  }
}
