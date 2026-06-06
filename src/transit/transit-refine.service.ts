import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AlarmType } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from '../common/services/onesignal.service';
import { KST_TIMEZONE } from '../common/utils/date.util';
import { LastTransitService, subtractMinutes } from './last-transit.service';

const TICK_MS = 30_000;
const TRANSIT_WINDOW_MIN = 30; // 막차: 발사 30분 전 1회
const APPT_STAGE1_MIN = 120; // 약속: 발사 2시간 전
const APPT_STAGE2_MIN = 30; // 약속: 발사 30분 전

/**
 * 발사 전에 ODsay로 한 번 더 재계산해 알람 시각을 보정한다.
 * - 막차: 발사 30분 전 1회
 * - 약속: 발사 2시간 전 + 30분 전 2회 (이동시간 변동 반영)
 * 보정되면 사일런트 푸시로 기기에 알려 알람을 재스케줄하게 한다.
 */
@Injectable()
export class TransitRefineService {
  private readonly logger = new Logger(TransitRefineService.name);
  private readonly schedulerEnabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lastTransit: LastTransitService,
    private readonly oneSignal: OneSignalService,
    config: ConfigService,
  ) {
    this.schedulerEnabled =
      (config.get<string>('RING_SCHEDULER_ENABLED') ?? 'true') !== 'false';
  }

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (!this.schedulerEnabled || this.running) return;
    this.running = true;
    try {
      await this.refineDue(new Date());
    } catch (error) {
      this.logger.error(
        'transit refine tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /** 발사 30분 이내로 진입한 미보정 막차 알람을 재계산한다. */
  async refineDue(now: Date = new Date()): Promise<number> {
    const nowMin = this.kstMinutes(now);
    let refined = 0;

    // ── 막차: 발사 30분 전 1회 ──
    const transit = await this.prisma.alarm.findMany({
      where: {
        type: AlarmType.LAST_TRANSIT,
        isEnabled: true,
        lastTransitRefined: false,
        time: { not: null },
        originLat: { not: null },
        destLat: { not: null },
      },
    });
    for (const a of transit) {
      const until = minutesUntil(toMinutes(a.time as string), nowMin);
      if (until <= 0 || until > TRANSIT_WINDOW_MIN) continue;
      const c = await this.lastTransit.compute(
        { name: a.originName ?? '', lat: a.originLat as number, lng: a.originLng as number },
        { name: a.destName ?? '', lat: a.destLat as number, lng: a.destLng as number },
      );
      await this.prisma.alarm.update({
        where: { id: a.id },
        data: {
          time: c.fireTime,
          lastDeparture: c.lastDeparture,
          boardingStopName: c.boardingStopName,
          walkMinutes: c.walkMinutes,
          lastTransitRefined: true,
        },
      });
      await this.notify(a.userId, a.id, c.fireTime, 'LAST_TRANSIT_UPDATED');
      refined++;
    }

    // ── 약속: 발사 2시간 전(stage1) + 30분 전(stage2) ──
    const appts = await this.prisma.alarm.findMany({
      where: {
        type: AlarmType.APPOINTMENT,
        isEnabled: true,
        appointmentRefineStage: { lt: 2 },
        time: { not: null },
        appointmentTime: { not: null },
        originLat: { not: null },
        destLat: { not: null },
      },
    });
    for (const a of appts) {
      const until = minutesUntil(toMinutes(a.time as string), nowMin);
      if (until <= 0) continue;
      const stage = a.appointmentRefineStage;
      let nextStage = stage;
      if (stage < 1 && until <= APPT_STAGE1_MIN) nextStage = 1;
      else if (stage < 2 && until <= APPT_STAGE2_MIN) nextStage = 2;
      if (nextStage === stage) continue; // 아직 윈도우 아님

      const travelMinutes = await this.lastTransit.computeTravelMinutes(
        { name: a.originName ?? '', lat: a.originLat as number, lng: a.originLng as number },
        { name: a.destName ?? '', lat: a.destLat as number, lng: a.destLng as number },
      );
      const fireTime = subtractMinutes(
        a.appointmentTime as string,
        travelMinutes + (a.prepMinutes ?? 0),
      );
      await this.prisma.alarm.update({
        where: { id: a.id },
        data: { time: fireTime, travelMinutes, appointmentRefineStage: nextStage },
      });
      await this.notify(a.userId, a.id, fireTime, 'APPOINTMENT_UPDATED');
      refined++;
    }

    if (refined > 0) this.logger.log(`refined ${refined} alarm(s)`);
    return refined;
  }

  private async notify(
    userId: string,
    alarmId: string,
    time: string,
    type: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { oneSignalSubscriptionId: true },
    });
    const sub = user?.oneSignalSubscriptionId;
    if (sub) {
      await this.oneSignal.sendDataPush([sub], { type, alarmId, time });
    }
  }

  private kstMinutes(now: Date): number {
    return toMinutes(formatInTimeZone(now, KST_TIMEZONE, 'HH:mm'));
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

function minutesUntil(fireMin: number, nowMin: number): number {
  return (fireMin - nowMin + 1440) % 1440;
}
