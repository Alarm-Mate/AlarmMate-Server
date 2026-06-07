import { Injectable } from '@nestjs/common';
import {
  AlarmType,
  NotificationType,
  Prisma,
  RingSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { OneSignalService } from '../common/services/onesignal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getKstDayBoundsUtc, toKstDateString } from '../common/utils/date.util';
import { CreateWakeDto } from './dto/wake.dto';

interface WakeResult {
  id: string;
  alarmId: string;
  groupId: string | null;
  wokeAt: string;
  wakeStreak: number;
  totalWakeDays: number;
  allMembersWoke: boolean;
}

@Injectable()
export class WakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oneSignalService: OneSignalService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async recordWake(userId: string, dto: CreateWakeDto): Promise<WakeResult> {
    const alarm = await this.prisma.alarm.findUnique({
      where: { id: dto.alarmId },
    });
    if (!alarm) {
      throw new AppException(ErrorCode.ALARM_NOT_FOUND);
    }
    if (alarm.userId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN);
    }

    const wokeAt = dto.wokeAt ? new Date(dto.wokeAt) : new Date();
    const date = toKstDateString(wokeAt);

    // 같은 알람·같은 KST 날짜에 이미 기록이 있으면 중복 거부(날짜별 1건).
    const existingToday = await this.prisma.wakeRecord.findUnique({
      where: { userId_alarmId_date: { userId, alarmId: dto.alarmId, date } },
    });
    if (existingToday) {
      throw new AppException(ErrorCode.ALREADY_WOKE_TODAY);
    }

    const groupId = alarm.type === AlarmType.GROUP ? alarm.groupId : null;

    const wokeYesterday = await this.wokeOnPreviousKstDay(userId, wokeAt);

    // 날짜별로 항상 새 기록을 남겨 과거 기상 이력을 보존한다.
    const record = await this.prisma.wakeRecord.create({
      data: { userId, alarmId: dto.alarmId, groupId, date, wokeAt },
    });

    const { wakeStreak, totalWakeDays } = await this.updateStreak(
      userId,
      wokeYesterday,
    );

    let allMembersWoke = false;
    if (groupId) {
      allMembersWoke = await this.handleGroupWake(userId, groupId, wokeAt);
    }

    await this.notifyFollowers(userId, wokeAt);

    return {
      id: record.id,
      alarmId: record.alarmId,
      groupId: record.groupId,
      wokeAt: record.wokeAt.toISOString(),
      wakeStreak,
      totalWakeDays,
      allMembersWoke,
    };
  }

  private async updateStreak(
    userId: string,
    wokeYesterday: boolean,
  ): Promise<{ wakeStreak: number; totalWakeDays: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }

    const nextStreak = wokeYesterday ? user.wakeStreak + 1 : 1;
    const nextTotal = user.totalWakeDays + 1;

    await this.prisma.user.update({
      where: { id: userId },
      data: { wakeStreak: nextStreak, totalWakeDays: nextTotal },
    });

    return { wakeStreak: nextStreak, totalWakeDays: nextTotal };
  }

  private async wokeOnPreviousKstDay(
    userId: string,
    wokeAt: Date,
  ): Promise<boolean> {
    const today = getKstDayBoundsUtc(wokeAt);
    const previous = new Date(today.start.getTime() - 24 * 60 * 60 * 1000);
    const { start, end } = getKstDayBoundsUtc(previous);
    const record = await this.prisma.wakeRecord.findFirst({
      where: { userId, wokeAt: { gte: start, lte: end } },
    });
    return record !== null;
  }

  private async handleGroupWake(
    userId: string,
    groupId: string,
    wokeAt: Date,
  ): Promise<boolean> {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            oneSignalSubscriptionId: true,
            notificationsEnabled: true,
          },
        },
      },
    });

    const subscriptionIds = members
      .filter((m) => m.userId !== userId && m.user.notificationsEnabled)
      .map((m) => m.user.oneSignalSubscriptionId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    await this.oneSignalService.sendSilentPush(subscriptionIds, {
      type: NotificationType.MEMBER_WOKE_UP,
      groupId,
      userId,
      wokeAt: wokeAt.toISOString(),
    });

    const { start, end } = getKstDayBoundsUtc(wokeAt);
    const wokeRecords = await this.prisma.wakeRecord.findMany({
      where: {
        groupId,
        userId: { in: members.map((m) => m.userId) },
        wokeAt: { gte: start, lte: end },
      },
      select: { userId: true },
    });
    const wokeSet = new Set(wokeRecords.map((r) => r.userId));
    const allMembersWoke = members.every((m) => wokeSet.has(m.userId));

    if (allMembersWoke && members.length > 0) {
      // 전원 기상 → 진행 중인 자동 재울림 세션 즉시 종료 (cron 대기 없이)
      await this.prisma.groupRingSession.updateMany({
        where: {
          groupId,
          date: toKstDateString(wokeAt),
          status: RingSessionStatus.ACTIVE,
        },
        data: { status: RingSessionStatus.COMPLETED, endedAt: new Date() },
      });

      const group = await this.prisma.group.findUnique({
        where: { id: groupId },
      });
      const payload: Prisma.InputJsonValue = {
        groupId,
        groupName: group?.name ?? '',
        date: toKstDateString(wokeAt),
      };
      await this.notificationsService.createMany(
        members.map((m) => ({
          userId: m.userId,
          type: NotificationType.ALL_MEMBERS_WOKE_UP,
          payload,
        })),
      );
    }

    return allMembersWoke;
  }

  private async notifyFollowers(userId: string, wokeAt: Date): Promise<void> {
    const followerIds = await this.prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    });
    if (followerIds.length === 0) {
      return;
    }
    const payload: Prisma.InputJsonValue = {
      userId,
      wokeAt: wokeAt.toISOString(),
    };
    await this.notificationsService.createMany(
      followerIds.map((f) => ({
        userId: f.followerId,
        type: NotificationType.MEMBER_WOKE_UP,
        payload,
      })),
    );
  }
}
