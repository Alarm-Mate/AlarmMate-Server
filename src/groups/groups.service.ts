import { Injectable } from '@nestjs/common';
import {
  AlarmType,
  GroupMemberRole,
  InvitationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { OneSignalService } from '../common/services/onesignal.service';
import {
  getKstDateString,
  getKstDayBoundsUtc,
  getKstDayBoundsUtcForDateString,
} from '../common/utils/date.util';
import {
  CreateGroupDto,
  MemberSettingsDto,
  TransferOwnerDto,
  UpdateGroupDto,
} from './dto/groups.dto';
import {
  buildPaginatedResult,
  DEFAULT_PAGE_LIMIT,
  PaginatedResult,
} from '../common/dto/cursor.dto';

interface MemberWakeView {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  role: GroupMemberRole;
  isEnabled: boolean;
  wokeToday: boolean;
  wokeAt: string | null;
}

interface GroupView {
  id: string;
  name: string;
  alarmTime: string;
  days: number[];
  myRole: GroupMemberRole;
  myIsEnabled: boolean;
  members: MemberWakeView[];
  createdAt: string;
}

interface MemberWakeStatusView {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  role: GroupMemberRole;
  wokeToday: boolean;
  wokeAt: string | null;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly oneSignalService: OneSignalService,
  ) {}

  // 그룹 초대 시 대상에게 사일런트 푸시 → 앱이 켜져 있으면 초대 목록을 즉시 갱신한다.
  private async pushInvite(
    targetUserId: string,
    groupId: string,
    groupName: string,
  ): Promise<void> {
    try {
      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { oneSignalSubscriptionId: true, notificationsEnabled: true },
      });
      const sub = target?.oneSignalSubscriptionId;
      if (!target?.notificationsEnabled || !sub) return;
      await this.oneSignalService.sendSilentPush([sub], {
        type: NotificationType.GROUP_INVITE,
        groupId,
        groupName,
      });
    } catch {
      /* 푸시 실패는 무시(목록 폴링으로 보강) */
    }
  }

  async listMyGroups(userId: string): Promise<GroupView[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    nickname: true,
                    profileImageUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const { start, end } = getKstDayBoundsUtc();
    const result: GroupView[] = [];

    for (const membership of memberships) {
      const group = membership.group;
      const memberUserIds = group.members.map((m) => m.userId);
      const wakeMap = await this.buildWakeMap(
        group.id,
        memberUserIds,
        start,
        end,
      );

      result.push({
        id: group.id,
        name: group.name,
        alarmTime: group.alarmTime,
        days: group.days,
        myRole: membership.role,
        myIsEnabled: membership.isEnabled,
        members: group.members.map((m) => {
          const wokeAt = wakeMap.get(m.userId) ?? null;
          return {
            userId: m.userId,
            nickname: m.user.nickname,
            profileImageUrl: m.user.profileImageUrl,
            role: m.role,
            isEnabled: m.isEnabled,
            wokeToday: wokeAt !== null,
            wokeAt: wokeAt ? wokeAt.toISOString() : null,
          };
        }),
        createdAt: group.createdAt.toISOString(),
      });
    }

    return result;
  }

  async getGroup(userId: string, groupId: string): Promise<GroupView> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      const group = await this.prisma.group.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new AppException(ErrorCode.GROUP_NOT_FOUND);
      }
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, nickname: true, profileImageUrl: true },
            },
          },
        },
      },
    });
    if (!group) {
      throw new AppException(ErrorCode.GROUP_NOT_FOUND);
    }

    const { start, end } = getKstDayBoundsUtc();
    const wakeMap = await this.buildWakeMap(
      group.id,
      group.members.map((m) => m.userId),
      start,
      end,
    );

    return {
      id: group.id,
      name: group.name,
      alarmTime: group.alarmTime,
      days: group.days,
      myRole: membership.role,
      myIsEnabled: membership.isEnabled,
      members: group.members.map((m) => {
        const wokeAt = wakeMap.get(m.userId) ?? null;
        return {
          userId: m.userId,
          nickname: m.user.nickname,
          profileImageUrl: m.user.profileImageUrl,
          role: m.role,
          isEnabled: m.isEnabled,
          wokeToday: wokeAt !== null,
          wokeAt: wokeAt ? wokeAt.toISOString() : null,
        };
      }),
      createdAt: group.createdAt.toISOString(),
    };
  }

  async createGroup(
    userId: string,
    dto: CreateGroupDto,
  ): Promise<GroupView> {
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: dto.name,
          alarmTime: dto.alarmTime,
          days: dto.days,
          isOneTime: dto.isOneTime ?? false,
        },
      });

      await tx.groupMember.create({
        data: {
          groupId: created.id,
          userId,
          role: GroupMemberRole.OWNER,
        },
      });

      await tx.alarm.create({
        data: {
          userId,
          name: created.name,
          time: created.alarmTime,
          days: created.days,
          type: AlarmType.GROUP,
          isOneTime: created.isOneTime,
          groupId: created.id,
        },
      });

      const targetIds = (dto.memberUserIds ?? []).filter(
        (id) => id !== userId,
      );
      const uniqueIds = Array.from(new Set(targetIds));
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const inviter = await tx.user.findUnique({
        where: { id: userId },
        select: { nickname: true },
      });

      for (const targetId of uniqueIds) {
        const exists = await tx.user.findUnique({ where: { id: targetId } });
        if (!exists) {
          continue;
        }
        await tx.groupInvitation.create({
          data: {
            groupId: created.id,
            invitedById: userId,
            userId: targetId,
            expiresAt,
          },
        });
        await tx.notification.create({
          data: {
            userId: targetId,
            type: NotificationType.GROUP_INVITE,
            payload: {
              groupId: created.id,
              groupName: created.name,
              invitedById: userId,
              fromNickname: inviter?.nickname ?? '',
            },
          },
        });
      }

      return created;
    });

    // 초대받은 멤버들에게 즉시 갱신용 사일런트 푸시(앱 켜져 있으면 초대 목록 바로 반영).
    const inviteTargets = Array.from(
      new Set((dto.memberUserIds ?? []).filter((id) => id !== userId)),
    );
    void Promise.all(
      inviteTargets.map((t) => this.pushInvite(t, group.id, group.name)),
    );

    return this.getGroup(userId, group.id);
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ): Promise<GroupView> {
    await this.ensureOwner(userId, groupId);

    const alarmData: Prisma.AlarmUpdateManyMutationInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.alarmTime !== undefined ? { time: dto.alarmTime } : {}),
      ...(dto.days !== undefined ? { days: dto.days } : {}),
    };
    const shouldSyncAlarms = Object.keys(alarmData).length > 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id: groupId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.alarmTime !== undefined ? { alarmTime: dto.alarmTime } : {}),
          ...(dto.days !== undefined ? { days: dto.days } : {}),
        },
      });
      if (shouldSyncAlarms) {
        await tx.alarm.updateMany({
          where: { groupId, type: AlarmType.GROUP },
          data: alarmData,
        });
      }
    });

    return this.getGroup(userId, groupId);
  }

  async deleteGroup(
    userId: string,
    groupId: string,
  ): Promise<{ deleted: boolean }> {
    await this.ensureOwner(userId, groupId);
    await this.prisma.$transaction(async (tx) => {
      await tx.alarm.deleteMany({ where: { groupId } });
      await tx.group.delete({ where: { id: groupId } });
    });
    return { deleted: true };
  }

  async invite(
    userId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<{ invited: boolean }> {
    await this.ensureOwner(userId, groupId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new AppException(ErrorCode.USER_NOT_FOUND);
    }

    const existingMember = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (existingMember) {
      return { invited: false };
    }

    const existingInvite = await this.prisma.groupInvitation.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (existingInvite && existingInvite.status === InvitationStatus.PENDING) {
      return { invited: false };
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    });

    await this.prisma.groupInvitation.upsert({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      create: {
        groupId,
        invitedById: userId,
        userId: targetUserId,
        status: InvitationStatus.PENDING,
        expiresAt,
      },
      update: {
        invitedById: userId,
        status: InvitationStatus.PENDING,
        expiresAt,
      },
    });

    await this.notificationsService.create(
      targetUserId,
      NotificationType.GROUP_INVITE,
      {
        groupId,
        groupName: group?.name ?? '',
        invitedById: userId,
        fromNickname: inviter?.nickname ?? '',
      },
    );
    await this.pushInvite(targetUserId, groupId, group?.name ?? '');

    return { invited: true };
  }

  async accept(
    userId: string,
    groupId: string,
  ): Promise<{ accepted: boolean }> {
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new AppException(ErrorCode.INVITATION_NOT_FOUND);
    }

    const existingMember = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (existingMember) {
      throw new AppException(ErrorCode.ALREADY_MEMBER);
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new AppException(ErrorCode.GROUP_NOT_FOUND);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.create({
        data: { groupId, userId, role: GroupMemberRole.MEMBER },
      });
      await tx.alarm.create({
        data: {
          userId,
          name: group.name,
          time: group.alarmTime,
          days: group.days,
          type: AlarmType.GROUP,
          isOneTime: group.isOneTime,
          groupId,
        },
      });
      await tx.groupInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED },
      });
    });

    return { accepted: true };
  }

  async decline(
    userId: string,
    groupId: string,
  ): Promise<{ declined: boolean }> {
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new AppException(ErrorCode.INVITATION_NOT_FOUND);
    }
    await this.prisma.groupInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.DECLINED },
    });
    return { declined: true };
  }

  async leave(userId: string, groupId: string): Promise<{ left: boolean }> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }
    if (membership.role === GroupMemberRole.OWNER) {
      throw new AppException(ErrorCode.OWNER_CANNOT_LEAVE);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.alarm.deleteMany({
        where: { userId, groupId, type: AlarmType.GROUP },
      });
      await tx.groupMember.delete({
        where: { groupId_userId: { groupId, userId } },
      });
    });

    return { left: true };
  }

  async kick(
    ownerId: string,
    groupId: string,
    targetUserId: string,
  ): Promise<{ removed: boolean }> {
    await this.ensureOwner(ownerId, groupId);
    if (targetUserId === ownerId) {
      throw new AppException(ErrorCode.OWNER_CANNOT_LEAVE);
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.alarm.deleteMany({
        where: { userId: targetUserId, groupId, type: AlarmType.GROUP },
      });
      await tx.groupMember.delete({
        where: { groupId_userId: { groupId, userId: targetUserId } },
      });
    });

    return { removed: true };
  }

  async toggleMember(
    userId: string,
    groupId: string,
  ): Promise<{ isEnabled: boolean }> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }
    const updated = await this.prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { isEnabled: !membership.isEnabled },
    });
    return { isEnabled: updated.isEnabled };
  }

  async transferOwner(
    ownerId: string,
    groupId: string,
    dto: TransferOwnerDto,
  ): Promise<{ transferred: boolean }> {
    await this.ensureOwner(ownerId, groupId);
    if (dto.newOwnerId === ownerId) {
      return { transferred: true };
    }

    const newOwnerMembership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: dto.newOwnerId } },
    });
    if (!newOwnerMembership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: ownerId } },
        data: { role: GroupMemberRole.MEMBER },
      });
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: dto.newOwnerId } },
        data: { role: GroupMemberRole.OWNER },
      });
    });

    return { transferred: true };
  }

  async wakeStatus(
    userId: string,
    groupId: string,
    date: string | undefined,
  ): Promise<{ date: string; members: MemberWakeStatusView[] }> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }

    const bounds = date
      ? getKstDayBoundsUtcForDateString(date)
      : getKstDayBoundsUtc();

    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
    });

    const wakeMap = await this.buildWakeMap(
      groupId,
      members.map((m) => m.userId),
      bounds.start,
      bounds.end,
    );

    const resolvedDate = date ?? getKstDateString();

    return {
      date: resolvedDate,
      members: members.map((m) => {
        const wokeAt = wakeMap.get(m.userId) ?? null;
        return {
          userId: m.userId,
          nickname: m.user.nickname,
          profileImageUrl: m.user.profileImageUrl,
          role: m.role,
          wokeToday: wokeAt !== null,
          wokeAt: wokeAt ? wokeAt.toISOString() : null,
        };
      }),
    };
  }

  async updateMemberSettings(
    userId: string,
    groupId: string,
    dto: MemberSettingsDto,
  ): Promise<{ vibration: boolean; soundId: string | null }> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }

    const memberData = {
      ...(dto.vibration !== undefined ? { vibration: dto.vibration } : {}),
      ...(dto.soundId !== undefined ? { soundId: dto.soundId } : {}),
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const member = await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: memberData,
      });
      if (Object.keys(memberData).length > 0) {
        await tx.alarm.updateMany({
          where: { userId, groupId, type: AlarmType.GROUP },
          data: memberData,
        });
      }
      return member;
    });

    return { vibration: updated.vibration, soundId: updated.soundId };
  }

  async ringState(
    userId: string,
    groupId: string,
  ): Promise<{
    active: boolean;
    allWoke: boolean;
    groupName: string;
    pendingMembers: Array<{ userId: string; nickname: string }>;
    wokeMembers: Array<{ userId: string; nickname: string; wokeAt: string }>;
    members: Array<{
      userId: string;
      nickname: string;
      profileImageUrl: string | null;
      wokeAt: string | null;
    }>;
  }> {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });

    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: {
        user: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
    });

    const { start, end } = getKstDayBoundsUtc();
    const wakeMap = await this.buildWakeMap(
      groupId,
      members.map((m) => m.userId),
      start,
      end,
    );

    const pendingMembers: Array<{ userId: string; nickname: string }> = [];
    const wokeMembers: Array<{
      userId: string;
      nickname: string;
      wokeAt: string;
    }> = [];
    const memberStates: Array<{
      userId: string;
      nickname: string;
      profileImageUrl: string | null;
      wokeAt: string | null;
    }> = [];

    for (const member of members) {
      const wokeAt = wakeMap.get(member.userId) ?? null;
      const wokeAtIso = wokeAt ? wokeAt.toISOString() : null;
      memberStates.push({
        userId: member.userId,
        nickname: member.user.nickname,
        profileImageUrl: member.user.profileImageUrl ?? null,
        wokeAt: wokeAtIso,
      });
      if (wokeAtIso) {
        wokeMembers.push({
          userId: member.userId,
          nickname: member.user.nickname,
          wokeAt: wokeAtIso,
        });
      } else {
        pendingMembers.push({
          userId: member.userId,
          nickname: member.user.nickname,
        });
      }
    }

    const allWoke = members.length > 0 && pendingMembers.length === 0;
    const active = membership.isEnabled && !allWoke;

    return {
      active,
      allWoke,
      groupName: group?.name ?? '그룹 알람',
      pendingMembers,
      wokeMembers,
      members: memberStates,
    };
  }

  async listInvitations(
    userId: string,
    cursor: string | undefined,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<
    PaginatedResult<{
      id: string;
      group: {
        id: string;
        name: string;
        alarmTime: string;
        memberCount: number;
      };
      invitedBy: { id: string; nickname: string };
      createdAt: string;
      expiresAt: string;
    }>
  > {
    const rows = await this.prisma.groupInvitation.findMany({
      where: {
        userId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        group: {
          include: { _count: { select: { members: true } } },
        },
        invitedBy: { select: { id: true, nickname: true } },
      },
    });

    const page = buildPaginatedResult(rows, limit);

    return {
      items: page.items.map((row) => ({
        id: row.id,
        group: {
          id: row.group.id,
          name: row.group.name,
          alarmTime: row.group.alarmTime,
          memberCount: row.group._count.members,
        },
        invitedBy: {
          id: row.invitedBy.id,
          nickname: row.invitedBy.nickname,
        },
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  private async ensureOwner(
    userId: string,
    groupId: string,
  ): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new AppException(ErrorCode.GROUP_NOT_FOUND);
    }
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new AppException(ErrorCode.NOT_GROUP_MEMBER);
    }
    if (membership.role !== GroupMemberRole.OWNER) {
      throw new AppException(ErrorCode.FORBIDDEN);
    }
  }

  private async buildWakeMap(
    groupId: string,
    memberUserIds: string[],
    start: Date,
    end: Date,
  ): Promise<Map<string, Date>> {
    if (memberUserIds.length === 0) {
      return new Map<string, Date>();
    }
    const records = await this.prisma.wakeRecord.findMany({
      where: {
        groupId,
        userId: { in: memberUserIds },
        wokeAt: { gte: start, lte: end },
      },
      select: { userId: true, wokeAt: true },
    });

    const map = new Map<string, Date>();
    for (const record of records) {
      const existing = map.get(record.userId);
      if (!existing || record.wokeAt.getTime() < existing.getTime()) {
        map.set(record.userId, record.wokeAt);
      }
    }
    return map;
  }
}
