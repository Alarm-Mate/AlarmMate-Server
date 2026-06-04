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
  name: string;
  time: string;
  days: number[];
  isEnabled: boolean;
  type: string;
  groupId: string | null;
}

async function createAlarm(
  h: Harness,
  token: string,
  name = 'Wake',
): Promise<AlarmView> {
  const res = await request(server(h.app))
    .post('/alarms')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, time: '07:00', days: [1, 2, 3] });
  return expectSuccess(res.body as ApiBody<AlarmView>);
}

describe('alarms', () => {
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
    alice = await registerUser(h.app, 'alice@b.com', 'alice');
    bob = await registerUser(h.app, 'bob@b.com', 'bob');
  });

  it('create: type forced PERSONAL', async () => {
    const res = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'A', time: '06:00', days: [0, 6] });
    expect(res.status).toBe(201);
    const alarm = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(alarm.type).toBe('PERSONAL');
    expect(alarm.groupId).toBeNull();
  });

  it('create: invalid day -> validation 400', async () => {
    const res = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'A', time: '06:00', days: [9] });
    expect(res.status).toBe(400);
  });

  it('list returns the user alarms', async () => {
    await createAlarm(h, alice.accessToken, 'one');
    await createAlarm(h, alice.accessToken, 'two');
    const res = await request(server(h.app))
      .get('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const list = expectSuccess(res.body as ApiBody<AlarmView[]>);
    expect(list).toHaveLength(2);
  });

  it('patch: owner ok', async () => {
    const alarm = await createAlarm(h, alice.accessToken);
    const res = await request(server(h.app))
      .patch(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Renamed', time: '08:30' });
    const updated = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(updated.name).toBe('Renamed');
    expect(updated.time).toBe('08:30');
  });

  it('patch: non-owner -> FORBIDDEN', async () => {
    const alarm = await createAlarm(h, alice.accessToken);
    const res = await request(server(h.app))
      .patch(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ name: 'Hijack' });
    expect(res.status).toBe(403);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe('FORBIDDEN');
  });

  it('patch: missing alarm -> ALARM_NOT_FOUND 404', async () => {
    const res = await request(server(h.app))
      .patch('/alarms/missing')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'ALARM_NOT_FOUND',
    );
  });

  it('delete: non-owner blocked', async () => {
    const alarm = await createAlarm(h, alice.accessToken);
    const res = await request(server(h.app))
      .delete(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
    const still = await h.prisma.alarm.findUnique({ where: { id: alarm.id } });
    expect(still).not.toBeNull();
  });

  it('delete: owner ok', async () => {
    const alarm = await createAlarm(h, alice.accessToken);
    const res = await request(server(h.app))
      .delete(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    const gone = await h.prisma.alarm.findUnique({ where: { id: alarm.id } });
    expect(gone).toBeNull();
  });

  it('toggle flips isEnabled', async () => {
    const alarm = await createAlarm(h, alice.accessToken);
    expect(alarm.isEnabled).toBe(true);
    const res = await request(server(h.app))
      .patch(`/alarms/${alarm.id}/toggle`)
      .set('Authorization', `Bearer ${alice.accessToken}`);
    const toggled = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(toggled.isEnabled).toBe(false);
  });
});
