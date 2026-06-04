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
  kstDateStringDaysAgo,
  toKstDateString,
} from '../common/utils/date.util';
import { UpdateMeDto } from './dto/users.dto';

interface MeProfile {
  id: string;
  email: string;
  nickname: string;
  profileImageUrl: string | null;
  wakeGoalTime: string | null;
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
  ) {}

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
      wakeStreak: user.wakeStreak,
      totalWakeDays: user.totalWakeDays,
      followerCount,
      followingCount,
      isFollowing,
      grassData,
    };
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
