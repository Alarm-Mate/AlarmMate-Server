import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { FollowsService } from '../follows/follows.service';
import {
  buildPaginatedResult,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
} from '../common/dto/cursor.dto';
import {
  getKstDayBoundsUtc,
  kstDateStringDaysAgo,
  toKstDateString,
} from '../common/utils/date.util';
import { AlarmType, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { OneSignalService } from '../common/services/onesignal.service';
import { SendReactionDto, UpdateMeDto } from './dto/users.dto';

interface MateAlarmView {
  id: string;
  name: string;
  time: string | null;
  days: number[];
  type: AlarmType;
  wokeToday: boolean;
}

interface DiscoverUser {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  isFollowing: boolean;
  alarms: { id: string; name: string; time: string | null; days: number[]; wokeToday: boolean }[];
}

interface MeProfile {
  id: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  wakeGoalTime: string | null;
  birthDate: string | null;
  timezone: string | null;
  bio: string | null;
  wakeStreak: number;
  totalWakeDays: number;
  oneSignalSubscriptionId: string | null;
  followerCount: number;
  followingCount: number;
  createdAt: string;
}

interface GrassEntry {
  date: string;
  woke: boolean;
  wokeAt: string | null;
}

interface PublicProfile {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  bio: string | null;
  wakeStreak: number;
  totalWakeDays: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  grassData: GrassEntry[];
}

interface SearchUserView {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  isFollowing: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followsService: FollowsService,
    private readonly notificationsService: NotificationsService,
    private readonly oneSignalService: OneSignalService,
  ) {}

  // 메이트에게 이모지 리액션 전송: 인앱 알림 생성 + (가능 시) 푸시.
  async sendReaction(
    fromUserId: string,
    targetUserId: string,
    dto: SendReactionDto,
  ): Promise<{ sent: boolean }> {
    if (fromUserId === targetUserId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, '자신에게는 보낼 수 없어요.');
    }
    const [sender, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: fromUserId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);
    if (!target || !sender) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }

    await this.notificationsService.create(targetUserId, NotificationType.REACTION, {
      fromUserId,
      fromNickname: sender.nickname,
      emoji: dto.emoji,
      kind: dto.kind ?? null,
    });

    if (target.oneSignalSubscriptionId) {
      await this.oneSignalService.sendNotification(
        [target.oneSignalSubscriptionId],
        '알람메이트',
        `${sender.nickname}님이 ${dto.emoji} 보냈어요`,
        { type: NotificationType.REACTION, fromUserId, emoji: dto.emoji },
      );
    }

    return { sent: true };
  }

  async getMe(userId: string): Promise<MeProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }
    const followerCount = await this.followsService.countFollowers(userId);
    const followingCount = await this.followsService.countFollowing(userId);

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      wakeGoalTime: user.wakeGoalTime,
      birthDate: user.birthDate,
      timezone: user.timezone,
      bio: user.bio,
      wakeStreak: user.wakeStreak,
      totalWakeDays: user.totalWakeDays,
      oneSignalSubscriptionId: user.oneSignalSubscriptionId,
      followerCount,
      followingCount,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeProfile> {
    if (dto.nickname !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { nickname: dto.nickname },
      });
      if (existing && existing.id !== userId) {
        throw new AppException(ErrorCode.NICKNAME_ALREADY_EXISTS);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.profileImageUrl !== undefined
          ? { profileImageUrl: dto.profileImageUrl }
          : {}),
        ...(dto.wakeGoalTime !== undefined
          ? { wakeGoalTime: dto.wakeGoalTime }
          : {}),
        ...(dto.birthDate !== undefined ? { birthDate: dto.birthDate } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      },
    });

    return this.getMe(userId);
  }

  async updateOneSignal(
    userId: string,
    subscriptionId: string,
  ): Promise<{ oneSignalSubscriptionId: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { oneSignalSubscriptionId: subscriptionId },
    });
    return { oneSignalSubscriptionId: subscriptionId };
  }

  async search(
    viewerId: string,
    nickname: string,
    cursor: string | undefined,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedResult<SearchUserView>> {
    const rows = await this.prisma.user.findMany({
      where: {
        nickname: { contains: nickname, mode: 'insensitive' },
        id: { not: viewerId },
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, nickname: true, profileImageUrl: true },
    });

    const page = buildPaginatedResult(rows, limit);
    const followingSet = await this.followsService.getFollowingIdSet(
      viewerId,
      page.items.map((u) => u.id),
    );

    return {
      items: page.items.map((u) => ({
        id: u.id,
        nickname: u.nickname,
        profileImageUrl: u.profileImageUrl,
        isFollowing: followingSet.has(u.id),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async getPublicProfile(
    viewerId: string,
    targetUserId: string,
  ): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }

    const followerCount = await this.followsService.countFollowers(targetUserId);
    const followingCount =
      await this.followsService.countFollowing(targetUserId);
    const isFollowing = await this.followsService.isFollowing(
      viewerId,
      targetUserId,
    );
    const grassData = await this.getGrass(targetUserId, 12);

    return {
      id: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      bio: user.bio,
      wakeStreak: user.wakeStreak,
      totalWakeDays: user.totalWakeDays,
      followerCount,
      followingCount,
      isFollowing,
      grassData,
    };
  }

  // 메이트 알람 공유: 대상 유저의 알람 목록 + 오늘(KST) 기상 여부.
  async getUserAlarms(targetUserId: string): Promise<MateAlarmView[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }
    const alarms = await this.prisma.alarm.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'asc' },
    });
    const { start, end } = getKstDayBoundsUtc();
    const todayRecords = await this.prisma.wakeRecord.findMany({
      where: { userId: targetUserId, wokeAt: { gte: start, lte: end } },
      select: { alarmId: true },
    });
    const wokeAlarmIds = new Set(todayRecords.map((r) => r.alarmId));
    return alarms.map((a) => ({
      id: a.id,
      name: a.name,
      time: a.time,
      days: a.days,
      type: a.type,
      wokeToday: wokeAlarmIds.has(a.id),
    }));
  }

  // 소셜 탐색: 최근 가입 유저들 + 각자의 개인 알람 + 오늘 기상 여부 + 내 팔로우 여부.
  async getDiscover(viewerId: string, limit = 20): Promise<DiscoverUser[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { not: viewerId } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        nickname: true,
        profileImageUrl: true,
        alarms: {
          where: { type: AlarmType.PERSONAL },
          orderBy: { createdAt: 'asc' },
          take: 3,
          select: { id: true, name: true, time: true, days: true },
        },
      },
    });
    const userIds = users.map((u) => u.id);
    const { start, end } = getKstDayBoundsUtc();
    const todayRecords = await this.prisma.wakeRecord.findMany({
      where: { userId: { in: userIds }, wokeAt: { gte: start, lte: end } },
      select: { alarmId: true },
    });
    const wokeAlarmIds = new Set(todayRecords.map((r) => r.alarmId));
    const followingSet = await this.followsService.getFollowingIdSet(viewerId, userIds);
    return users.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      profileImageUrl: u.profileImageUrl,
      isFollowing: followingSet.has(u.id),
      alarms: u.alarms.map((a) => ({
        id: a.id,
        name: a.name,
        time: a.time,
        days: a.days,
        wokeToday: wokeAlarmIds.has(a.id),
      })),
    }));
  }

  async getGrass(userId: string, weeks: number): Promise<GrassEntry[]> {
    const totalDays = weeks * 7;
    const startDateString = kstDateStringDaysAgo(totalDays - 1);
    const startBound = new Date(`${startDateString}T00:00:00+09:00`);

    const records = await this.prisma.wakeRecord.findMany({
      where: { userId, wokeAt: { gte: startBound } },
      select: { wokeAt: true },
    });

    const wokeByDate = new Map<string, Date>();
    for (const record of records) {
      const key = toKstDateString(record.wokeAt);
      const existing = wokeByDate.get(key);
      if (!existing || record.wokeAt.getTime() < existing.getTime()) {
        wokeByDate.set(key, record.wokeAt);
      }
    }

    const entries: GrassEntry[] = [];
    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const dateString = kstDateStringDaysAgo(i);
      const wokeAt = wokeByDate.get(dateString);
      entries.push({
        date: dateString,
        woke: wokeAt !== undefined,
        wokeAt: wokeAt ? wokeAt.toISOString() : null,
      });
    }
    return entries;
  }
}
