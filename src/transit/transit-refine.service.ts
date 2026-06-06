import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { AlarmType } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from '../common/services/onesignal.service';
import { KST_TIMEZONE } from '../common/utils/date.util';
import { LastTransitService } from './last-transit.service';

const TICK_MS = 30_000;
const REFINE_WINDOW_MIN = 30; // 발사 30분 전부터 재계산

/**
 * 막차 알람을 발사 30분 전에 한 번 더 ODsay로 재계산해 시각을 보정한다.
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
    const candidates = await this.prisma.alarm.findMany({
      where: {
        type: AlarmType.LAST_TRANSIT,
        isEnabled: true,
        lastTransitRefined: false,
        time: { not: null },
        originLat: { not: null },
        destLat: { not: null },
      },
    });

    let refined = 0;
    for (const a of candidates) {
      const fireMin = toMinutes(a.time as string);
      const until = (fireMin - nowMin + 1440) % 1440; // 발사까지 남은 분
      if (until <= 0 || until > REFINE_WINDOW_MIN) continue;

      const computation = await this.lastTransit.compute(
        { name: a.originName ?? '', lat: a.originLat as number, lng: a.originLng as number },
        { name: a.destName ?? '', lat: a.destLat as number, lng: a.destLng as number },
      );
      await this.prisma.alarm.update({
        where: { id: a.id },
        data: {
          time: computation.fireTime,
          lastDeparture: computation.lastDeparture,
          boardingStopName: computation.boardingStopName,
          walkMinutes: computation.walkMinutes,
          lastTransitRefined: true,
        },
      });

      // 기기에 알려 재스케줄.
      const user = await this.prisma.user.findUnique({
        where: { id: a.userId },
        select: { oneSignalSubscriptionId: true },
      });
      const sub = user?.oneSignalSubscriptionId;
      if (sub) {
        await this.oneSignal.sendDataPush([sub], {
          type: 'LAST_TRANSIT_UPDATED',
          alarmId: a.id,
          time: computation.fireTime,
        });
      }
      refined++;
    }
    if (refined > 0) {
      this.logger.log(`refined ${refined} last-transit alarm(s)`);
    }
    return refined;
  }

  private kstMinutes(now: Date): number {
    return toMinutes(formatInTimeZone(now, KST_TIMEZONE, 'HH:mm'));
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}
