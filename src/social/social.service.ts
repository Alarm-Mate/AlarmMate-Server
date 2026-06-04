import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaginatedResult,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
} from '../common/dto/cursor.dto';
import { getKstDayBoundsUtc } from '../common/utils/date.util';

interface FeedEntry {
  id: string;
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  wokeToday: boolean;
  wokeAt: string | null;
}

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(
    userId: string,
    cursor: string | undefined,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedResult<FeedEntry>> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
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
    const targetIds = page.items.map((r) => r.following.id);

    const { start, end } = getKstDayBoundsUtc();
    const wakeMap = new Map<string, Date>();
    if (targetIds.length > 0) {
      const records = await this.prisma.wakeRecord.findMany({
        where: {
          userId: { in: targetIds },
          wokeAt: { gte: start, lte: end },
        },
        select: { userId: true, wokeAt: true },
      });
      for (const record of records) {
        const existing = wakeMap.get(record.userId);
        if (!existing || record.wokeAt.getTime() < existing.getTime()) {
          wakeMap.set(record.userId, record.wokeAt);
        }
      }
    }

    return {
      items: page.items.map((r) => {
        const wokeAt = wakeMap.get(r.following.id) ?? null;
        return {
          id: r.id,
          userId: r.following.id,
          nickname: r.following.nickname,
          profileImageUrl: r.following.profileImageUrl,
          wokeToday: wokeAt !== null,
          wokeAt: wokeAt ? wokeAt.toISOString() : null,
        };
      }),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}
