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

interface AlarmView {
  id: string;
  type: string;
  groupId: string | null;
}

interface GroupView {
  id: string;
  members: Array<{ userId: string }>;
}

interface WakeResult {
  id: string;
  alarmId: string;
  groupId: string | null;
  wakeStreak: number;
  totalWakeDays: number;
  allMembersWoke: boolean;
}

interface WakeStatusResult {
  date: string;
  members: Array<{ userId: string; wokeToday: boolean; wokeAt: string | null }>;
}

const KST_OFFSET = '+09:00';

function kstDateString(daysAgo: number): string {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(kstMs);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function kstNoonUtc(daysAgo: number): Date {
  return new Date(`${kstDateString(daysAgo)}T12:00:00${KST_OFFSET}`);
}

async function personalAlarm(
  h: Harness,
  token: string,
): Promise<AlarmView> {
  const res = await request(server(h.app))
    .post('/alarms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'A', time: '07:00', days: [1, 2, 3] });
  return expectSuccess(res.body as ApiBody<AlarmView>);
}

describe('wake', () => {
  let h: Harness;
  let alice: AuthTokens;
  let bob: AuthTokens;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    h.oneSignal.sendSilentPush.mockClear();
    alice = await registerUser(h.app, 'alice@b.com', 'alice');
    bob = await registerUser(h.app, 'bob@b.com', 'bob');
  });

  it('POST /wake creates a record and starts streak at 1', async () => {
    const alarm = await personalAlarm(h, alice.accessToken);
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: alarm.id });
    expect(res.status).toBe(201);
    const data = expectSuccess(res.body as ApiBody<WakeResult>);
    expect(data.wakeStreak).toBe(1);
    expect(data.totalWakeDays).toBe(1);
  });

  it('same alarm same KST day again -> ALREADY_WOKE_TODAY 409', async () => {
    const alarm = await personalAlarm(h, alice.accessToken);
    await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: alarm.id });
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: alarm.id });
    expect(res.status).toBe(409);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'ALREADY_WOKE_TODAY',
    );
  });

  it('streak increments on consecutive day', async () => {
    const alarm = await personalAlarm(h, alice.accessToken);
    await h.prisma.wakeRecord.create({
      data: {
        userId: alice.user.id,
        alarmId: alarm.id,
        wokeAt: kstNoonUtc(1),
      },
    });
    await h.prisma.user.update({
      where: { id: alice.user.id },
      data: { wakeStreak: 3, totalWakeDays: 3 },
    });
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: alarm.id, wokeAt: kstNoonUtc(0).toISOString() });
    const data = expectSuccess(res.body as ApiBody<WakeResult>);
    expect(data.wakeStreak).toBe(4);
    expect(data.totalWakeDays).toBe(4);
  });

  it('streak resets after a gap', async () => {
    const alarm = await personalAlarm(h, alice.accessToken);
    await h.prisma.wakeRecord.create({
      data: {
        userId: alice.user.id,
        alarmId: alarm.id,
        wokeAt: kstNoonUtc(3),
      },
    });
    await h.prisma.user.update({
      where: { id: alice.user.id },
      data: { wakeStreak: 5, totalWakeDays: 5 },
    });
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: alarm.id, wokeAt: kstNoonUtc(0).toISOString() });
    const data = expectSuccess(res.body as ApiBody<WakeResult>);
    expect(data.wakeStreak).toBe(1);
    expect(data.totalWakeDays).toBe(6);
  });

  it('wake on non-owned alarm -> FORBIDDEN', async () => {
    const alarm = await personalAlarm(h, alice.accessToken);
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ alarmId: alarm.id });
    expect(res.status).toBe(403);
  });

  it('group wake: silent push to other members (self excluded, nulls skipped)', async () => {
    const groupRes = await request(server(h.app))
      .post('/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Crew',
        alarmTime: '07:00',
        days: [1],
        memberUserIds: [bob.user.id],
      });
    const group = expectSuccess(groupRes.body as ApiBody<GroupView>);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    const carol = await registerUser(h.app, 'carol@b.com', 'carol');
    await request(server(h.app))
      .post(`/groups/${group.id}/invite`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ userId: carol.user.id });
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${carol.accessToken}`);

    await h.prisma.user.update({
      where: { id: bob.user.id },
      data: { oneSignalSubscriptionId: 'bob-sub' },
    });

    const aliceGroupAlarm = await h.prisma.alarm.findFirst({
      where: { userId: alice.user.id, groupId: group.id, type: 'GROUP' },
    });

    h.oneSignal.sendSilentPush.mockClear();
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: aliceGroupAlarm?.id });
    const data = expectSuccess(res.body as ApiBody<WakeResult>);
    expect(data.groupId).toBe(group.id);
    expect(data.allMembersWoke).toBe(false);

    expect(h.oneSignal.sendSilentPush).toHaveBeenCalledTimes(1);
    const call = h.oneSignal.sendSilentPush.mock.calls[0];
    const subs = call[0];
    expect(subs).toEqual(['bob-sub']);
    const payload = call[1] as {
      type: string;
      groupId: string;
      userId: string;
    };
    expect(payload.type).toBe('MEMBER_WOKE_UP');
    expect(payload.groupId).toBe(group.id);
    expect(payload.userId).toBe(alice.user.id);
  });

  it('group wake: all members woke -> ALL_MEMBERS_WOKE_UP notifications created', async () => {
    const groupRes = await request(server(h.app))
      .post('/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Crew',
        alarmTime: '07:00',
        days: [1],
        memberUserIds: [bob.user.id],
      });
    const group = expectSuccess(groupRes.body as ApiBody<GroupView>);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    const aliceAlarm = await h.prisma.alarm.findFirst({
      where: { userId: alice.user.id, groupId: group.id, type: 'GROUP' },
    });
    const bobAlarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id, type: 'GROUP' },
    });

    await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: aliceAlarm?.id });
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ alarmId: bobAlarm?.id });
    const data = expectSuccess(res.body as ApiBody<WakeResult>);
    expect(data.allMembersWoke).toBe(true);

    const notifs = await h.prisma.notification.findMany({
      where: { type: 'ALL_MEMBERS_WOKE_UP' },
    });
    const recipients = new Set(notifs.map((n) => n.userId));
    expect(recipients.has(alice.user.id)).toBe(true);
    expect(recipients.has(bob.user.id)).toBe(true);
  });

  it('followers get MEMBER_WOKE_UP notifications on wake', async () => {
    await h.prisma.follow.create({
      data: { followerId: bob.user.id, followingId: alice.user.id },
    });
    const alarm = await personalAlarm(h, alice.accessToken);
    await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: alarm.id });
    const notifs = await h.prisma.notification.findMany({
      where: { userId: bob.user.id, type: 'MEMBER_WOKE_UP' },
    });
    expect(notifs).toHaveLength(1);
  });

  it('GET /groups/:groupId/wake-status default today reflects wake', async () => {
    const groupRes = await request(server(h.app))
      .post('/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Crew', alarmTime: '07:00', days: [1] });
    const group = expectSuccess(groupRes.body as ApiBody<GroupView>);
    const aliceAlarm = await h.prisma.alarm.findFirst({
      where: { userId: alice.user.id, groupId: group.id, type: 'GROUP' },
    });
    await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ alarmId: aliceAlarm?.id });

    const res = await request(server(h.app))
      .get(`/groups/${group.id}/wake-status`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const data = expectSuccess(res.body as ApiBody<WakeStatusResult>);
    expect(data.date).toBe(kstDateString(0));
    const me = data.members.find((m) => m.userId === alice.user.id);
    expect(me?.wokeToday).toBe(true);
  });

  it('GET /groups/:groupId/wake-status with date param', async () => {
    const groupRes = await request(server(h.app))
      .post('/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Crew', alarmTime: '07:00', days: [1] });
    const group = expectSuccess(groupRes.body as ApiBody<GroupView>);
    const target = kstDateString(2);
    const res = await request(server(h.app))
      .get(`/groups/${group.id}/wake-status`)
      .query({ date: target })
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const data = expectSuccess(res.body as ApiBody<WakeStatusResult>);
    expect(data.date).toBe(target);
    expect(data.members[0].wokeToday).toBe(false);
  });

  it('wake-status non-member -> NOT_GROUP_MEMBER', async () => {
    const groupRes = await request(server(h.app))
      .post('/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Crew', alarmTime: '07:00', days: [1] });
    const group = expectSuccess(groupRes.body as ApiBody<GroupView>);
    const res = await request(server(h.app))
      .get(`/groups/${group.id}/wake-status`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
  });
});
