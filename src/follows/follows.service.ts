import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildPaginatedResult,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
} from '../common/dto/cursor.dto';

interface FollowUserView {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  isFollowing: boolean;
}

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async follow(
    followerId: string,
    followingId: string,
  ): Promise<{ following: boolean }> {
    if (followerId === followingId) {
      throw new AppException(ErrorCode.CANNOT_FOLLOW_SELF);
    }

    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
    });
    if (!target) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) {
      throw new AppException(ErrorCode.ALREADY_FOLLOWING);
    }

    await this.prisma.follow.create({ data: { followerId, followingId } });

    const follower = await this.prisma.user.findUnique({
      where: { id: followerId },
      select: { nickname: true },
    });
    await this.notificationsService.create(
      followingId,
      NotificationType.NEW_FOLLOWER,
      { followerId, followerNickname: follower?.nickname ?? '' },
    );

    return { following: true };
  }

  async unfollow(
    followerId: string,
    followingId: string,
  ): Promise<{ following: boolean }> {
    await this.prisma.follow.deleteMany({
      where: { followerId, followingId },
    });
    return { following: false };
  }

  async getFollowingIdSet(
    viewerId: string,
    targetIds: string[],
  ): Promise<Set<string>> {
    if (targetIds.length === 0) {
      return new Set<string>();
    }
    const rows = await this.prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: targetIds } },
      select: { followingId: true },
    });
    return new Set(rows.map((r) => r.followingId));
  }

  async isFollowing(viewerId: string, targetId: string): Promise<boolean> {
    const row = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetId,
        },
      },
    });
    return row !== null;
  }

  async listFollowers(
    viewerId: string,
    targetUserId: string,
    cursor: string | undefined,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedResult<FollowUserView>> {
    const rows = await this.prisma.follow.findMany({
      where: { followingId: targetUserId },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        follower: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
    });

    const page = buildPaginatedResult(rows, limit);
    const followingSet = await this.getFollowingIdSet(
      viewerId,
      page.items.map((r) => r.follower.id),
    );

    return {
      items: page.items.map((r) => ({
        id: r.follower.id,
        nickname: r.follower.nickname,
        profileImageUrl: r.follower.profileImageUrl,
        isFollowing: followingSet.has(r.follower.id),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async listFollowing(
    viewerId: string,
    targetUserId: string,
    cursor: string | undefined,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedResult<FollowUserView>> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: targetUserId },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        following: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
    });

    const page = buildPaginatedResult(rows, limit);
    const followingSet = await this.getFollowingIdSet(
      viewerId,
      page.items.map((r) => r.following.id),
    );

    return {
      items: page.items.map((r) => ({
        id: r.following.id,
        nickname: r.following.nickname,
        profileImageUrl: r.following.profileImageUrl,
        isFollowing: followingSet.has(r.following.id),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async countFollowers(userId: string): Promise<number> {
    return this.prisma.follow.count({ where: { followingId: userId } });
  }

  async countFollowing(userId: string): Promise<number> {
    return this.prisma.follow.count({ where: { followerId: userId } });
  }

  async getFollowingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    return rows.map((r) => r.followingId);
  }
}
