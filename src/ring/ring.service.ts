import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { RingSessionStatus } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';
import { OneSignalService } from '../common/services/onesignal.service';
import {
  KST_TIMEZONE,
  getKstDayBoundsUtcForDateString,
  toKstDateString,
} from '../common/utils/date.util';

const TICK_MS = 30_000;

/**
 * 그룹 자동 재울림 엔진.
 * - startDueSessions: KST 현재 시각에 울려야 하는 그룹의 세션을 생성한다(기기 로컬 알람이 T0에 울림).
 * - processActiveSessions: ACTIVE 세션을 순회하며, 안 깬 멤버에게 일정 간격으로 재울림 푸시를 보낸다.
 *   모든 멤버가 깨면 COMPLETED, 최대 시도를 넘으면 EXPIRED.
 */
@Injectable()
export class RingService {
  private readonly logger = new Logger(RingService.name);
  private readonly intervalMs: number;
  private readonly maxAttempts: number;
  private readonly schedulerEnabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneSignal: OneSignalService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('RERING_INTERVAL_MS') ?? 120_000);
    this.maxAttempts = Number(config.get('RERING_MAX_ATTEMPTS') ?? 8);
    this.schedulerEnabled =
      (config.get<string>('RING_SCHEDULER_ENABLED') ?? 'true') !== 'false';
  }

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (!this.schedulerEnabled || this.running) {
      return;
    }
    this.running = true;
    try {
      const now = new Date();
      await this.startDueSessions(now);
      await this.processActiveSessions(now);
    } catch (error) {
      this.logger.error(
        'ring tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /** 현재 KST 시각/요일에 울려야 하는 그룹의 재울림 세션을 시작한다. 생성 개수 반환. */
  async startDueSessions(now: Date = new Date()): Promise<number> {
    const hhmm = formatInTimeZone(now, KST_TIMEZONE, 'HH:mm');
    // ISO 요일(1=월..7=일) → 앱 규칙(0=월..6=일)
    const dayIndex = Number(formatInTimeZone(now, KST_TIMEZONE, 'i')) - 1;
    const date = toKstDateString(now);

    const groups = await this.prisma.group.findMany({
      where: { alarmTime: hhmm, days: { has: dayIndex } },
      select: { id: true },
    });
    if (groups.length === 0) {
      return 0;
    }

    const { count } = await this.prisma.groupRingSession.createMany({
      data: groups.map((g) => ({ groupId: g.id, date, lastRingAt: now })),
      skipDuplicates: true,
    });
    if (count > 0) {
      this.logger.log(`started ${count} group ring session(s) at ${hhmm} KST`);
    }
    return count;
  }

  /** ACTIVE 세션을 모두 처리한다. */
  async processActiveSessions(now: Date = new Date()): Promise<void> {
    const sessions = await this.prisma.groupRingSession.findMany({
      where: { status: RingSessionStatus.ACTIVE },
      select: { id: true },
    });
    for (const { id } of sessions) {
      await this.processSession(id, now);
    }
  }

  /** 세션 1개 처리: 안 깬 멤버에게 재울림을 보내거나 세션을 종료한다. */
  async processSession(sessionId: string, now: Date = new Date()): Promise<void> {
    const session = await this.prisma.groupRingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== RingSessionStatus.ACTIVE) {
      return;
    }

    const group = await this.prisma.group.findUnique({
      where: { id: session.groupId },
      include: {
        members: {
          where: { isEnabled: true },
          include: {
            user: { select: { id: true, oneSignalSubscriptionId: true } },
          },
        },
      },
    });
    if (!group || group.members.length === 0) {
      await this.endSession(sessionId, RingSessionStatus.COMPLETED, now);
      return;
    }

    const { start, end } = getKstDayBoundsUtcForDateString(session.date);
    const woke = await this.prisma.wakeRecord.findMany({
      where: {
        groupId: session.groupId,
        userId: { in: group.members.map((m) => m.userId) },
        wokeAt: { gte: start, lte: end },
      },
      select: { userId: true },
    });
    const wokeSet = new Set(woke.map((w) => w.userId));
    const nonWoke = group.members.filter((m) => !wokeSet.has(m.userId));

    if (nonWoke.length === 0) {
      await this.endSession(sessionId, RingSessionStatus.COMPLETED, now);
      return;
    }
    if (session.attempts >= this.maxAttempts) {
      await this.endSession(sessionId, RingSessionStatus.EXPIRED, now);
      return;
    }
    const elapsed = session.lastRingAt
      ? now.getTime() - session.lastRingAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (elapsed < this.intervalMs) {
      return;
    }

    const subscriptionIds = nonWoke
      .map((m) => m.user.oneSignalSubscriptionId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const attempt = session.attempts + 1;
    await this.oneSignal.sendGroupReRing(subscriptionIds, group.name, attempt);
    await this.prisma.groupRingSession.update({
      where: { id: sessionId },
      data: { attempts: attempt, lastRingAt: now },
    });
  }

  private async endSession(
    id: string,
    status: RingSessionStatus,
    now: Date,
  ): Promise<void> {
    await this.prisma.groupRingSession.update({
      where: { id },
      data: { status, endedAt: now },
    });
  }
}
