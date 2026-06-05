import { Harness, createHarness, resetDb, closeHarness } from './harness';
import {
  ApiBody,
  AuthTokens,
  expectSuccess,
  registerUser,
  request,
  server,
} from './http';

interface PlaceResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
}

interface AlarmView {
  id: string;
  type: string;
  time: string | null;
  name: string;
  originName: string | null;
  destName: string | null;
  lastDeparture: string | null;
  boardingStopName: string | null;
  walkMinutes: number | null;
}

describe('last-transit alarm', () => {
  let h: Harness;
  let user: AuthTokens;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    user = await registerUser(h.app, 'lt@b.com', 'lt');
  });

  it('GET /places/search returns distance-sorted results', async () => {
    const res = await request(server(h.app))
      .get('/places/search')
      .query({ q: 'CGV', lat: '35.1689', lng: '129.1316' })
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(res.status).toBe(200);
    const places = expectSuccess(res.body as ApiBody<PlaceResult[]>);
    expect(places.length).toBeGreaterThan(0);
    // 거리순 정렬 확인
    for (let i = 1; i < places.length; i++) {
      expect(places[i].distanceM).toBeGreaterThanOrEqual(places[i - 1].distanceM);
    }
  });

  it('POST /alarms/last-transit creates a LAST_TRANSIT alarm at computed fireTime', async () => {
    const res = await request(server(h.app))
      .post('/alarms/last-transit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        originName: '센텀시티 CGV',
        originLat: 35.1693,
        originLng: 129.1295,
        destName: '서면 CGV',
        destLat: 35.1577,
        destLng: 129.0595,
      });
    expect(res.status).toBe(201);
    const alarm = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(alarm.type).toBe('LAST_TRANSIT');
    expect(alarm.name).toContain('서면 CGV');
    expect(alarm.destName).toBe('서면 CGV');
    expect(alarm.originName).toBe('센텀시티 CGV');
    expect(alarm.lastDeparture).toBe('23:50');
    expect(alarm.walkMinutes).toBeGreaterThanOrEqual(3);
    // fireTime 형식 HH:mm + 막차보다 이름(여유+도보)
    expect(alarm.time).toMatch(/^\d{2}:\d{2}$/);
    expect(alarm.time).not.toBe('23:50');

    // 목록에도 LAST_TRANSIT 로 뜬다
    const list = await request(server(h.app))
      .get('/alarms')
      .set('Authorization', `Bearer ${user.accessToken}`);
    const alarms = expectSuccess(list.body as ApiBody<AlarmView[]>);
    expect(alarms.some((a) => a.type === 'LAST_TRANSIT')).toBe(true);
  });

  it('POST /alarms/last-transit requires valid coordinates', async () => {
    const res = await request(server(h.app))
      .post('/alarms/last-transit')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ originName: 'a', destName: 'b' });
    expect(res.status).toBe(400);
  });
});
