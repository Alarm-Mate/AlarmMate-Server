// 그룹 자동 재울림 엔진 e2e.
// 스케줄러 cron 은 끄고(RING_SCHEDULER_ENABLED=false) 서비스 메서드를 직접 호출해 검증한다.
process.env.RING_SCHEDULER_ENABLED = 'false';
process.env.RERING_INTERVAL_MS = '0'; // 테스트에선 간격 없이 즉시 재울림
process.env.RERING_MAX_ATTEMPTS = '3';

import { RingSessionStatus } from '@prisma/client';
import { Harness, createHarness, resetDb, closeHarness } from './harness';
import {
  ApiBody,
  AuthTokens,
  expectSuccess,
  registerUser,
  request,
  server,
} from './http';
import { RingService } from '../src/ring/ring.service';

interface GroupView {
  id: string;
  members: Array<{ userId: string }>;
}

// 동일한 now 로 그룹 시각/요일과 startDueSessions 를 맞춘다.
function kstParts(now: Date): { hhmm: string; dayIndex: number } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kst.toISOString().slice(11, 16);
  const dayIndex = (kst.getUTCDay() + 6) % 7; // 0=월..6=일
  return { hhmm, dayIndex };
}

describe('group auto re-ring', () => {
  let h: Harness;
  let ring: RingService;
  let alice: AuthTokens;
  let bob: AuthTokens;
  let group: GroupView;
  let now: Date;

  beforeAll(async () => {
    h = await createHarness();
    ring = h.app.get(RingService);
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  beforeEach(async () => {
    await resetDb(h.prisma);
    h.oneSignal.sendGroupReRing.mockClear();
    now = new Date();
    const { hhmm, dayIndex } = kstParts(now);

    alice = await registerUser(h.app, 'alice@b.com', 'alice');
    bob = await registerUser(h.app, 'bob@b.com', 'bob');

    const groupRes = await request(server(h.app))
      .post('/groups')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Crew',
        alarmTime: hhmm,
        days: [dayIndex],
        memberUserIds: [bob.user.id],
      });
    group = expectSuccess(groupRes.body as ApiBody<GroupView>);
    await request(server(h.app))
      .post(`/groups/${group.id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);

    await h.prisma.user.update({
      where: { id: alice.user.id },
      data: { oneSignalSubscriptionId: 'alice-sub' },
    });
    await h.prisma.user.update({
      where: { id: bob.user.id },
      data: { oneSignalSubscriptionId: 'bob-sub' },
    });
  });

  async function seedWake(userId: string): Promise<void> {
    const alarm = await h.prisma.alarm.findFirst({
      where: { userId, groupId: group.id, type: 'GROUP' },
    });
    await h.prisma.wakeRecord.create({
      data: {
        userId,
        alarmId: alarm!.id,
        groupId: group.id,
        date: new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10),
        wokeAt: now,
      },
    });
  }

  it('startDueSessions creates one ACTIVE session, idempotent on re-run', async () => {
    expect(await ring.startDueSessions(now)).toBe(1);
    expect(await ring.startDueSessions(now)).toBe(0); // dedup by (group, date)

    const sessions = await h.prisma.groupRingSession.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe(RingSessionStatus.ACTIVE);
  });

  it('does not start a session when no group matches the current KST minute', async () => {
    const off = new Date(now.getTime() + 90 * 60 * 1000); // +90분
    expect(await ring.startDueSessions(off)).toBe(0);
    expect(await h.prisma.groupRingSession.count()).toBe(0);
  });

  it('re-rings only members who have not woken yet', async () => {
    await ring.startDueSessions(now);
    await seedWake(alice.user.id); // alice 만 기상

    await ring.processActiveSessions(now);

    expect(h.oneSignal.sendGroupReRing).toHaveBeenCalledTimes(1);
    const [subs, groupName] = h.oneSignal.sendGroupReRing.mock.calls[0];
    expect(subs).toEqual(['bob-sub']); // 안 깬 bob 에게만
    expect(groupName).toBe('Crew');

    const session = await h.prisma.groupRingSession.findFirst();
    expect(session?.attempts).toBe(1);
    expect(session?.status).toBe(RingSessionStatus.ACTIVE);
  });

  it('completes the session (no re-ring) once all members woke', async () => {
    await ring.startDueSessions(now);
    await seedWake(alice.user.id);
    await seedWake(bob.user.id);

    await ring.processActiveSessions(now);

    expect(h.oneSignal.sendGroupReRing).not.toHaveBeenCalled();
    const session = await h.prisma.groupRingSession.findFirst();
    expect(session?.status).toBe(RingSessionStatus.COMPLETED);
  });

  it('POST /wake by the last member completes the active session immediately', async () => {
    await ring.startDueSessions(now);
    await seedWake(alice.user.id); // alice 미리 기상 기록

    const bobAlarm = await h.prisma.alarm.findFirst({
      where: { userId: bob.user.id, groupId: group.id, type: 'GROUP' },
    });
    const res = await request(server(h.app))
      .post('/wake')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ alarmId: bobAlarm!.id, wokeAt: now.toISOString() });
    expect(res.status).toBe(201);

    const session = await h.prisma.groupRingSession.findFirst();
    expect(session?.status).toBe(RingSessionStatus.COMPLETED);
  });

  it('expires the session after max attempts are exhausted', async () => {
    await ring.startDueSessions(now);
    // 아무도 안 깬 상태에서 max attempts 까지 채움
    await h.prisma.groupRingSession.updateMany({
      data: { attempts: 3, lastRingAt: new Date(0) },
    });

    await ring.processActiveSessions(now);

    expect(h.oneSignal.sendGroupReRing).not.toHaveBeenCalled();
    const session = await h.prisma.groupRingSession.findFirst();
    expect(session?.status).toBe(RingSessionStatus.EXPIRED);
  });
});
