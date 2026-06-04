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

interface MemberView {
  userId: string;
  role: string;
  isEnabled: boolean;
  wokeToday: boolean;
}

interface GroupView {
  id: string;
  name: string;
  alarmTime: string;
  days: number[];
  myRole: string;
  myIsEnabled: boolean;
  members: MemberView[];
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

describe('groups', () => {
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

  it('create: owner is OWNER member, invitations created, owner GROUP alarm auto-created', async () => {
    const group = await createGroup(h, owner.accessToken, [
      bob.user.id,
      carol.user.id,
    ]);
    expect(group.myRole).toBe('OWNER');
    expect(group.members).toHaveLength(1);
    expect(group.members[0].userId).toBe(owner.user.id);

    const invites = await h.prisma.groupInvitation.findMany({
      where: { groupId: group.id },
    });
    expect(invites).toHaveLength(2);
    expect(invites.every((i) => i.status === 'PENDING')).toBe(true);

    const expiryMs =
      invites[0].expiresAt.getTime() - invites[0].createdAt.getTime();
    expect(Math.round(expiryMs / (24 * 60 * 60 * 1000))).toBe(7);

    const ownerAlarm = await h.prisma.alarm.findFirst({
      where: { userId: owner.user.id, groupId: group.id, type: 'GROUP' },
    });
    expect(ownerAlarm).not.toBeNull();

    const invitedNotifs = await h.prisma.notification.findMany({
      where: { type: 'GROUP_INVITE' },
    });
    expect(invitedNotifs).toHaveLength(2);
  });

  it('list: members[] with today wake status', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .get('/groups')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    const list = expectSuccess(res.body as ApiBody<GroupView[]>);
    expect(list).toHaveLength(1);
    expect(list[0].members[0].wokeToday).toBe(false);
  });

  it('get: non-member -> NOT_GROUP_MEMBER 403', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .get(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'NOT_GROUP_MEMBER',
    );
  });

  it('get: missing group -> GROUP_NOT_FOUND 404', async () => {
    const res = await request(server(h.app))
      .get('/groups/missing')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(404);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'GROUP_NOT_FOUND',
    );
  });

  it('patch: non-owner blocked, owner ok', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    const blocked = await request(server(h.app))
      .patch(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ name: 'Hijacked' });
    expect(blocked.status).toBe(403);

    const ok = await request(server(h.app))
      .patch(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Renamed', alarmTime: '08:00' });
    const updated = expectSuccess(ok.body as ApiBody<GroupView>);
    expect(updated.name).toBe('Renamed');
  });

  it('delete: owner only, cascade', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    const blocked = await request(server(h.app))
      .delete(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(blocked.status).toBe(403);

    const ok = await request(server(h.app))
      .delete(`/groups/${group.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(ok.status).toBe(200);

    const gone = await h.prisma.group.findUnique({ where: { id: group.id } });
    expect(gone).toBeNull();
    const members = await h.prisma.groupMember.findMany({
      where: { groupId: group.id },
    });
    expect(members).toHaveLength(0);
    const alarms = await h.prisma.alarm.findMany({
      where: { groupId: group.id },
    });
    expect(alarms).toHaveLength(0);
  });

  it('invite: non-owner blocked', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/invite`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ userId: carol.user.id });
    expect(res.status).toBe(403);
  });

  it('invite: already-member -> skipped (invited:false)', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: bob.user.id });
    expect(res.status).toBe(200);
    const data = expectSuccess(res.body as ApiBody<{ invited: boolean }>);
    expect(data.invited).toBe(false);
  });

  it('invite: already pending -> skipped (invited:false)', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: bob.user.id });
    const data = expectSuccess(res.body as ApiBody<{ invited: boolean }>);
    expect(data.invited).toBe(false);
  });

  it('invite: fresh invite has 7-day expiry and invited:true', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ userId: bob.user.id });
    const data = expectSuccess(res.body as ApiBody<{ invited: boolean }>);
    expect(data.invited).toBe(true);
    const invite = await h.prisma.groupInvitation.findFirst({
      where: { groupId: group.id, userId: bob.user.id },
    });
    const days = Math.round(
      ((invite?.expiresAt.getTime() ?? 0) -
        (invite?.createdAt.getTime() ?? 0)) /
        (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(7);
  });

  it('accept: no pending invite -> INVITATION_NOT_FOUND', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(404);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'INVITATION_NOT_FOUND',
    );
  });

  it('accept: adds member, auto-creates GROUP alarm, invite ACCEPTED', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(200);

    const member = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: bob.user.id } },
    });
    expect(member?.role).toBe('MEMBER');
    const alarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id, type: 'GROUP' },
    });
    expect(alarm).not.toBeNull();
    const invite = await h.prisma.groupInvitation.findFirst({
      where: { groupId: group.id, userId: bob.user.id },
    });
    expect(invite?.status).toBe('ACCEPTED');
  });

  it('decline: sets invite DECLINED', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    const res = await request(server(h.app))
      .post(`/groups/${group.id}/decline`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(200);
    const invite = await h.prisma.groupInvitation.findFirst({
      where: { groupId: group.id, userId: bob.user.id },
    });
    expect(invite?.status).toBe('DECLINED');
  });

  it('leave: OWNER -> OWNER_CANNOT_LEAVE', async () => {
    const group = await createGroup(h, owner.accessToken);
    const res = await request(server(h.app))
      .delete(`/groups/${group.id}/leave`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(409);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'OWNER_CANNOT_LEAVE',
    );
  });

  it('leave: member leaves -> their GROUP alarm deleted', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    const res = await request(server(h.app))
      .delete(`/groups/${group.id}/leave`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(200);
    const member = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: bob.user.id } },
    });
    expect(member).toBeNull();
    const alarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id },
    });
    expect(alarm).toBeNull();
  });

  it('kick: owner only; kicked user GROUP alarm deleted', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    const blocked = await request(server(h.app))
      .delete(`/groups/${group.id}/members/${bob.user.id}`)
      .set('Authorization', `Bearer ${carol.accessToken}`);
    expect(blocked.status).toBeGreaterThanOrEqual(403);

    const ok = await request(server(h.app))
      .delete(`/groups/${group.id}/members/${bob.user.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(ok.status).toBe(200);
    const alarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id },
    });
    expect(alarm).toBeNull();
  });

  it('toggle: only own GroupMember.isEnabled changes, others unaffected', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    const res = await request(server(h.app))
      .patch(`/groups/${group.id}/toggle`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    const data = expectSuccess(res.body as ApiBody<{ isEnabled: boolean }>);
    expect(data.isEnabled).toBe(false);

    const ownerMember = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: owner.user.id } },
    });
    expect(ownerMember?.isEnabled).toBe(true);
  });

  it('owner transfer: newOwner must be member; roles swapped', async () => {
    const group = await createGroup(h, owner.accessToken, [bob.user.id]);

    const notMember = await request(server(h.app))
      .patch(`/groups/${group.id}/owner`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ newOwnerId: carol.user.id });
    expect(notMember.status).toBe(403);

    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    const ok = await request(server(h.app))
      .patch(`/groups/${group.id}/owner`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ newOwnerId: bob.user.id });
    expect(ok.status).toBe(200);

    const newOwner = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: bob.user.id } },
    });
    const oldOwner = await h.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: owner.user.id } },
    });
    expect(newOwner?.role).toBe('OWNER');
    expect(oldOwner?.role).toBe('MEMBER');
  });
});
