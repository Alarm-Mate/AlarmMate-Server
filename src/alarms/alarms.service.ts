import { Injectable } from '@nestjs/common';
import { Alarm, AlarmType, LocationTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { CreateAlarmDto, UpdateAlarmDto } from './dto/alarms.dto';
import { LastTransitService } from '../transit/last-transit.service';
import {
  CreateAppointmentDto,
  CreateLastTransitDto,
} from '../transit/dto/transit.dto';
import { subtractMinutes } from '../transit/last-transit.service';

interface AlarmView {
  id: string;
  clientId: string | null;
  name: string;
  time: string | null;
  days: number[];
  isEnabled: boolean;
  vibration: boolean;
  isOneTime: boolean;
  soundId: string | null;
  type: AlarmType;
  groupId: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  locationTrigger: LocationTrigger | null;
  // 막차 알람 표시용
  originName: string | null;
  destName: string | null;
  lastDeparture: string | null;
  boardingStopName: string | null;
  walkMinutes: number | null;
  // 약속 알람 표시용
  appointmentTime: string | null;
  prepMinutes: number | null;
  travelMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AlarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lastTransitService: LastTransitService,
  ) {}

  /** 막차 알람 생성: 출발지·목적지 → 막차 계산 → fireTime에 LAST_TRANSIT 알람 생성. */
  async createLastTransit(
    userId: string,
    dto: CreateLastTransitDto,
  ): Promise<AlarmView> {
    const computation = await this.lastTransitService.compute(
      { name: dto.originName, lat: dto.originLat, lng: dto.originLng },
      { name: dto.destName, lat: dto.destLat, lng: dto.destLng },
    );
    const alarm = await this.prisma.alarm.create({
      data: {
        userId,
        name: `막차 · ${dto.destName}`,
        time: computation.fireTime,
        days: [], // 오늘 밤 1회성
        type: AlarmType.LAST_TRANSIT,
        originName: dto.originName,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destName: dto.destName,
        destLat: dto.destLat,
        destLng: dto.destLng,
        lastDeparture: computation.lastDeparture,
        boardingStopName: computation.boardingStopName,
        walkMinutes: computation.walkMinutes,
      },
    });
    return this.toView(alarm);
  }

  /** 약속 알람 생성: 약속시간 − 이동시간 − 준비시간 = fireTime 에 알람 생성. */
  async createAppointment(
    userId: string,
    dto: CreateAppointmentDto,
  ): Promise<AlarmView> {
    const travelMinutes = await this.lastTransitService.computeTravelMinutes(
      { name: dto.originName, lat: dto.originLat, lng: dto.originLng },
      { name: dto.destName, lat: dto.destLat, lng: dto.destLng },
    );
    const fireTime = subtractMinutes(
      dto.appointmentTime,
      travelMinutes + dto.prepMinutes,
    );
    const alarm = await this.prisma.alarm.create({
      data: {
        userId,
        name: dto.name,
        time: fireTime,
        days: [],
        vibration: dto.vibration,
        type: AlarmType.APPOINTMENT,
        originName: dto.originName,
        originLat: dto.originLat,
        originLng: dto.originLng,
        destName: dto.destName,
        destLat: dto.destLat,
        destLng: dto.destLng,
        appointmentTime: dto.appointmentTime,
        prepMinutes: dto.prepMinutes,
        travelMinutes,
      },
    });
    return this.toView(alarm);
  }

  async list(userId: string): Promise<AlarmView[]> {
    const alarms = await this.prisma.alarm.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return alarms.map((a) => this.toView(a));
  }

  async create(userId: string, dto: CreateAlarmDto): Promise<AlarmView> {
    const type = dto.type ?? AlarmType.PERSONAL;

    if (type === AlarmType.LOCATION) {
      if (
        dto.placeName === undefined ||
        dto.latitude === undefined ||
        dto.longitude === undefined ||
        dto.radius === undefined ||
        dto.locationTrigger === undefined
      ) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'placeName, latitude, longitude, radius and locationTrigger are required for LOCATION alarms',
        );
      }
    } else {
      if (dto.time === undefined) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'time is required for PERSONAL alarms',
        );
      }
      if (this.hasLocationFields(dto)) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'location fields are not allowed for PERSONAL alarms',
        );
      }
    }

    const isLocation = type === AlarmType.LOCATION;
    const alarm = await this.prisma.alarm.create({
      data: {
        userId,
        clientId: dto.clientId ?? null,
        name: dto.name,
        time: dto.time ?? null,
        days: dto.days ?? [],
        vibration: dto.vibration ?? true,
        isOneTime: dto.isOneTime ?? false,
        soundId: dto.soundId ?? null,
        type,
        placeName: isLocation ? (dto.placeName ?? null) : null,
        latitude: isLocation ? (dto.latitude ?? null) : null,
        longitude: isLocation ? (dto.longitude ?? null) : null,
        radius: isLocation ? (dto.radius ?? null) : null,
        locationTrigger: isLocation ? (dto.locationTrigger ?? null) : null,
      },
    });
    return this.toView(alarm);
  }

  async update(
    userId: string,
    alarmId: string,
    dto: UpdateAlarmDto,
  ): Promise<AlarmView> {
    const existing = await this.ensureOwned(userId, alarmId);

    if (existing.type !== AlarmType.LOCATION && this.hasLocationFields(dto)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'location fields are only allowed for LOCATION alarms',
      );
    }

    const data: Prisma.AlarmUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
      ...(dto.time !== undefined ? { time: dto.time } : {}),
      ...(dto.days !== undefined ? { days: dto.days } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
      ...(dto.vibration !== undefined ? { vibration: dto.vibration } : {}),
      ...(dto.isOneTime !== undefined ? { isOneTime: dto.isOneTime } : {}),
      ...(dto.soundId !== undefined ? { soundId: dto.soundId } : {}),
      ...(dto.placeName !== undefined ? { placeName: dto.placeName } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.radius !== undefined ? { radius: dto.radius } : {}),
      ...(dto.locationTrigger !== undefined
        ? { locationTrigger: dto.locationTrigger }
        : {}),
    };

    const alarm = await this.prisma.alarm.update({
      where: { id: alarmId },
      data,
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

  private hasLocationFields(dto: CreateAlarmDto | UpdateAlarmDto): boolean {
    return (
      dto.placeName !== undefined ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined ||
      dto.radius !== undefined ||
      dto.locationTrigger !== undefined
    );
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
      clientId: alarm.clientId,
      name: alarm.name,
      time: alarm.time,
      days: alarm.days,
      isEnabled: alarm.isEnabled,
      vibration: alarm.vibration,
      isOneTime: alarm.isOneTime,
      soundId: alarm.soundId,
      type: alarm.type,
      groupId: alarm.groupId,
      placeName: alarm.placeName,
      latitude: alarm.latitude,
      longitude: alarm.longitude,
      radius: alarm.radius,
      locationTrigger: alarm.locationTrigger,
      originName: alarm.originName,
      destName: alarm.destName,
      lastDeparture: alarm.lastDeparture,
      boardingStopName: alarm.boardingStopName,
      walkMinutes: alarm.walkMinutes,
      appointmentTime: alarm.appointmentTime,
      prepMinutes: alarm.prepMinutes,
      travelMinutes: alarm.travelMinutes,
      createdAt: alarm.createdAt.toISOString(),
      updatedAt: alarm.updatedAt.toISOString(),
    };
  }
}
