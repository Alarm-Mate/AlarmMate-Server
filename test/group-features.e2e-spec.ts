import { Harness, createHarness, resetDb, closeHarness } from './harness';
import {
  ApiBody,
  AuthTokens,
  expectError,
  expectSuccess,
  registerUser,
  request,
  server,
} from './http';

interface GroupView {
  id: string;
  name: string;
  alarmTime: string;
  days: number[];
}

interface RingState {
  active: boolean;
  allWoke: boolean;
  pendingMembers: Array<{ userId: string; nickname: string }>;
  wokeMembers: Array<{ userId: string; nickname: string; wokeAt: string }>;
}

interface MemberSettingsResult {
  vibration: boolean;
  soundId: string | null;
}

interface InvitationItem {
  id: string;
  group: {
    id: string;
    name: string;
    alarmTime: string;
    memberCount: number;
  };
  invitedBy: { id: string; nickname: string };
}

interface InvitationsPage {
  items: InvitationItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function createGroup(
  h: Harness,
  token: string,
  memberUserIds: string[] = [],
): Promise<GroupView> {
  const res = await request(server(h.app))
    .post('/groups')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Crew', alarmTime: '07:00', days: [1, 2, 3], memberUserIds });
  return expectSuccess(res.body as ApiBody<GroupView>);
}

async function accept(
  h: Harness,
  token: string,
  groupId: string,
): Promise<void> {
  await request(server(h.app))
    .post(`/groups/${groupId}/accept`)
    .set('Authorization', `Bearer ${token}`);
}

describe('group features', () => {
  let h: Harness;
  let owner: AuthTokens;
  let bob: AuthTokens;
  let carol: AuthTokens;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    owner = await registerUser(h.app, 'owner@b.com', 'owner');
    bob = await registerUser(h.app, 'bob@b.com', 'bob');
    carol = await registerUser(h.app, 'carol@b.com', 'carol');
  });

  it('group edit propagates name/time/days to all member GROUP alarms, preserving per-member fields', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await accept(h, bob.accessToken, group.id);

    const bobAlarmBefore = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id, type: 'GROUP' },
    });
    await h.prisma.alarm.update({
      where: { id: bobAlarmBefore!.id },
      data: { isEnabled: false, vibration: false, soundId: 'custom-1' },
    });

    const res = await request(server(h.app))
      .patch(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'New Crew', alarmTime: '08:30', days: [4, 5] });
    expect(res.status).toBe(200);

    const alarms = await h.prisma.alarm.findMany({
      where: { groupId: group.id, type: 'GROUP' },
    });
    expect(alarms).toHaveLength(2);
    for (const alarm of alarms) {
      expect(alarm.name).toBe('New Crew');
      expect(alarm.time).toBe('08:30');
      expect(alarm.days).toEqual([4, 5]);
    }

    const bobAlarmAfter = alarms.find((a) => a.userId === bob.user.id);
    expect(bobAlarmAfter!.isEnabled).toBe(false);
    expect(bobAlarmAfter!.vibration).toBe(false);
    expect(bobAlarmAfter!.soundId).toBe('custom-1');
  });

  it('member-settings: updates only caller GroupMember and caller GROUP alarm', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await accept(h, bob.accessToken, group.id);

    const res = await request(server(h.app))
      .patch(`/groups/${group.id}/member-settings`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ vibration: false, soundId: 'snd-99' });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<MemberSettingsResult>);
    expect(data.vibration).toBe(false);
    expect(data.soundId).toBe('snd-99');

    const bobMember = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: bob.user.id } },
    });
    expect(bobMember!.vibration).toBe(false);
    expect(bobMember!.soundId).toBe('snd-99');

    const bobAlarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id, type: 'GROUP' },
    });
    expect(bobAlarm!.vibration).toBe(false);
    expect(bobAlarm!.soundId).toBe('snd-99');

    const ownerMember = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: owner.user.id } },
    });
    expect(ownerMember!.vibration).toBe(true);
    expect(ownerMember!.soundId).toBeNull();
  });

  it('member-settings: non-member -> NOT_GROUP_MEMBER 403', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .patch(`/groups/${group.id}/member-settings`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ vibration: false });
    expect(res.status).toBe(403);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'NOT_GROUP_MEMBER',
    );
  });

  it('ring-state: active until all members woke, then allWoke true', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await accept(h, bob.accessToken, group.id);

    const before = await request(server(h.app))
      .get(`/groups/${group.id}/ring-state`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(before.status).toBe(200);
    const stateBefore = expectSuccess(before.body as ApiBody<RingState>);
    expect(stateBefore.active).toBe(true);
    expect(stateBefore.allWoke).toBe(false);
    expect(stateBefore.pendingMembers).toHaveLength(2);
    expect(stateBefore.wokeMembers).toHaveLength(0);

    const ownerAlarm = await h.prisma.alarm.findFirst({
      where: { userId: owner.user.id, groupId: group.id, type: 'GROUP' },
    });
    await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ alarmId: ownerAlarm!.id });

    const mid = await request(server(h.app))
      .get(`/groups/${group.id}/ring-state`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const stateMid = expectSuccess(mid.body as ApiBody<RingState>);
    expect(stateMid.allWoke).toBe(false);
    expect(stateMid.active).toBe(true);
    expect(stateMid.wokeMembers).toHaveLength(1);
    expect(stateMid.pendingMembers).toHaveLength(1);

    const bobAlarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id, type: 'GROUP' },
    });
    await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ alarmId: bobAlarm!.id });

    const after = await request(server(h.app))
      .get(`/groups/${group.id}/ring-state`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const stateAfter = expectSuccess(after.body as ApiBody<RingState>);
    expect(stateAfter.allWoke).toBe(true);
    expect(stateAfter.active).toBe(false);
    expect(stateAfter.pendingMembers).toHaveLength(0);
    expect(stateAfter.wokeMembers).toHaveLength(2);
  });

  it('ring-state: non-member -> NOT_GROUP_MEMBER 403', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .get(`/groups/${group.id}/ring-state`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'NOT_GROUP_MEMBER',
    );
  });

  it('invitations: lists own pending invitations with group/inviter info', async () => {
    const group = await createGroup(h, owner.accessToken, [
      bob.user.id,
      carol.user.id,
    ]);

    const res = await request(server(h.app))
      .get('/groups/invitations')
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(200);
    const page = expectSuccess(res.body as ApiBody<InvitationsPage>);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].group.id).toBe(group.id);
    expect(page.items[0].group.name).toBe('Crew');
    expect(page.items[0].group.alarmTime).toBe('07:00');
    expect(page.items[0].group.memberCount).toBe(1);
    expect(page.items[0].invitedBy.id).toBe(owner.user.id);
    expect(page.items[0].invitedBy.nickname).toBe('owner');
  });

  it('invitations: excludes accepted and expired invitations', async () => {
    const group = await createGroup(h, owner.accessToken, [
      bob.user.id,
      carol.user.id,
    ]);
    await accept(h, bob.accessToken, group.id);

    const carolInvite = await h.prisma.groupInvitation.findFirst({
      where: { groupId: group.id, userId: carol.user.id },
    });
    await h.prisma.groupInvitation.update({
      where: { id: carolInvite!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const bobRes = await request(server(h.app))
      .get('/groups/invitations')
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(expectSuccess(bobRes.body as ApiBody<InvitationsPage>).items).toHaveLength(
      0,
    );

    const carolRes = await request(server(h.app))
      .get('/groups/invitations')
      .set('Authorization', `Bearer ${carol.accessToken}`);
    expect(
      expectSuccess(carolRes.body as ApiBody<InvitationsPage>).items,
    ).toHaveLength(0);
  });
});
