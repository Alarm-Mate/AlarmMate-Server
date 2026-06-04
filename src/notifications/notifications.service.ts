import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import {
  buildPaginatedResult,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
} from '../common/dto/cursor.dto';

interface NotificationView {
  id: string;
  type: NotificationType;
  isRead: boolean;
  payload: Prisma.JsonValue;
  createdAt: string;
}

interface NotificationListResult extends PaginatedResult<NotificationView> {
  unreadCount: number;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    type: NotificationType,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, payload },
    });
  }

  async createMany(
    entries: Array<{
      userId: string;
      type: NotificationType;
      payload: Prisma.InputJsonValue;
    }>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({ data: entries });
  }

  async list(
    userId: string,
    cursor: string | undefined,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<NotificationListResult> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    const page = buildPaginatedResult(rows, limit);
    return {
      items: page.items.map((n) => ({
        id: n.id,
        type: n.type,
        isRead: n.isRead,
        payload: n.payload,
        createdAt: n.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      unreadCount,
    };
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<{ id: string; isRead: boolean }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new AppException(ErrorCode.NOTIFICATION_NOT_FOUND);
    }
    if (notification.userId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN);
    }
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
    return { id: updated.id, isRead: updated.isRead };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }
}
