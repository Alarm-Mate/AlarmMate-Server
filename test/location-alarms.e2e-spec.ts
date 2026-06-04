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
  time: string | null;
  days: number[];
  type: string;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  locationTrigger: string | null;
}

describe('location alarms', () => {
  let h: Harness;
  let alice: AuthTokens;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    alice = await registerUser(h.app, 'alice@b.com', 'alice');
  });

  it('create LOCATION alarm: time optional, location fields stored', async () => {
    const res = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Office',
        type: 'LOCATION',
        placeName: 'HQ',
        latitude: 37.5665,
        longitude: 126.978,
        radius: 200,
        locationTrigger: 'ARRIVE',
      });
    expect(res.status).toBe(201);
    const alarm = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(alarm.type).toBe('LOCATION');
    expect(alarm.time).toBeNull();
    expect(alarm.placeName).toBe('HQ');
    expect(alarm.latitude).toBeCloseTo(37.5665);
    expect(alarm.radius).toBe(200);
    expect(alarm.locationTrigger).toBe('ARRIVE');
  });

  it('create LOCATION alarm: missing location fields -> VALIDATION_ERROR 400', async () => {
    const res = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Office', type: 'LOCATION', placeName: 'HQ' });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('create PERSONAL alarm: time required -> VALIDATION_ERROR 400 when missing', async () => {
    const res = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Morning', days: [1, 2] });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('create PERSONAL alarm: location fields rejected -> VALIDATION_ERROR 400', async () => {
    const res = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Morning',
        time: '07:00',
        days: [1, 2],
        placeName: 'HQ',
      });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('update LOCATION alarm: edits location fields', async () => {
    const created = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Office',
        type: 'LOCATION',
        placeName: 'HQ',
        latitude: 37.5,
        longitude: 127.0,
        radius: 200,
        locationTrigger: 'ARRIVE',
      });
    const alarm = expectSuccess(created.body as ApiBody<AlarmView>);

    const res = await request(server(h.app))
      .patch(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ placeName: 'Gym', radius: 500, locationTrigger: 'LEAVE' });
    expect(res.status).toBe(200);
    const updated = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(updated.placeName).toBe('Gym');
    expect(updated.radius).toBe(500);
    expect(updated.locationTrigger).toBe('LEAVE');
  });

  it('update PERSONAL alarm: location fields rejected -> VALIDATION_ERROR 400', async () => {
    const created = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Morning', time: '07:00', days: [1] });
    const alarm = expectSuccess(created.body as ApiBody<AlarmView>);

    const res = await request(server(h.app))
      .patch(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ placeName: 'HQ' });
    expect(res.status).toBe(400);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('update LOCATION alarm: ownership enforced -> FORBIDDEN 403', async () => {
    const bob = await registerUser(h.app, 'bob@b.com', 'bob');
    const created = await request(server(h.app))
      .post('/alarms')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({
        name: 'Office',
        type: 'LOCATION',
        placeName: 'HQ',
        latitude: 37.5,
        longitude: 127.0,
        radius: 200,
        locationTrigger: 'ARRIVE',
      });
    const alarm = expectSuccess(created.body as ApiBody<AlarmView>);

    const res = await request(server(h.app))
      .patch(`/alarms/${alarm.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ placeName: 'Gym' });
    expect(res.status).toBe(403);
    expect(expectError(res.body as ApiBody<unknown>).code).toBe('FORBIDDEN');
  });
});
