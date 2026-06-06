// 재계산 cron 은 끄고 메서드를 직접 호출해 검증.
process.env.RING_SCHEDULER_ENABLED = 'false';

import { Harness, createHarness, resetDb, closeHarness } from './harness';
import {
  ApiBody,
  AuthTokens,
  expectSuccess,
  registerUser,
  request,
  server,
} from './http';
import { TransitRefineService } from '../src/transit/transit-refine.service';

// KST HH:mm 에 분을 더해 "HH:mm" 반환.
function kstPlus(now: Date, addMin: number): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const total = (kst.getUTCHours() * 60 + kst.getUTCMinutes() + addMin + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

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
  appointmentTime: string | null;
  prepMinutes: number | null;
  travelMinutes: number | null;
}

describe('last-transit alarm', () => {
  let h: Harness;
  let user: AuthTokens;
  let refine: TransitRefineService;

  beforeAll(async () => {
    h = await createHarness();
    refine = h.app.get(TransitRefineService);
  });
  afterAll(async () => {
    await closeHarness(h);
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
    h.oneSignal.sendDataPush.mockClear();
    user = await registerUser(h.app, 'lt@b.com', 'lt');
  });

  async function createTransitAlarm(): Promise<string> {
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
    return expectSuccess(res.body as ApiBody<AlarmView>).id;
  }

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

  it('refineDue recomputes an alarm within 30min of firing + pushes update', async () => {
    const alarmId = await createTransitAlarm();
    const now = new Date();
    // 발사 20분 전 상황으로 세팅 + 구독 id 등록
    await h.prisma.alarm.update({
      where: { id: alarmId },
      data: { time: kstPlus(now, 20), lastTransitRefined: false },
    });
    await h.prisma.user.update({
      where: { id: user.user.id },
      data: { oneSignalSubscriptionId: 'lt-sub' },
    });

    const count = await refine.refineDue(now);
    expect(count).toBe(1);

    const updated = await h.prisma.alarm.findUnique({ where: { id: alarmId } });
    expect(updated?.lastTransitRefined).toBe(true);

    expect(h.oneSignal.sendDataPush).toHaveBeenCalledTimes(1);
    const [subs, data] = h.oneSignal.sendDataPush.mock.calls[0];
    expect(subs).toEqual(['lt-sub']);
    expect(data.type).toBe('LAST_TRANSIT_UPDATED');
    expect(data.alarmId).toBe(alarmId);
  });

  it('POST /alarms/appointment creates APPOINTMENT alarm at appt − travel − prep', async () => {
    const res = await request(server(h.app))
      .post('/alarms/appointment')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        name: '회의',
        appointmentTime: '14:00',
        prepMinutes: 30,
        vibration: true,
        originName: '현재 위치',
        originLat: 35.1693,
        originLng: 129.1295,
        destName: '서면 회의실',
        destLat: 35.1577,
        destLng: 129.0595,
      });
    expect(res.status).toBe(201);
    const alarm = expectSuccess(res.body as ApiBody<AlarmView>);
    expect(alarm.type).toBe('APPOINTMENT');
    expect(alarm.name).toBe('회의');
    expect(alarm.appointmentTime).toBe('14:00');
    expect(alarm.prepMinutes).toBe(30);
    expect(alarm.travelMinutes).toBeGreaterThanOrEqual(5);
    expect(alarm.time).toMatch(/^\d{2}:\d{2}$/);
    // fireTime = 14:00 − (travel + 30) → 14:00보다 이름
    expect(alarm.time).not.toBe('14:00');
  });

  it('POST /alarms/appointment rejects bad appointmentTime', async () => {
    const res = await request(server(h.app))
      .post('/alarms/appointment')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        name: 'x',
        appointmentTime: '25:99',
        prepMinutes: 10,
        vibration: true,
        originName: 'a',
        originLat: 35.1,
        originLng: 129.1,
        destName: 'b',
        destLat: 35.2,
        destLng: 129.2,
      });
    expect(res.status).toBe(400);
  });

  async function createApptAlarm(): Promise<string> {
    const res = await request(server(h.app))
      .post('/alarms/appointment')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        name: '회의',
        appointmentTime: '14:00',
        prepMinutes: 30,
        vibration: true,
        originName: '현재 위치',
        originLat: 35.1693,
        originLng: 129.1295,
        destName: '서면',
        destLat: 35.1577,
        destLng: 129.0595,
      });
    return expectSuccess(res.body as ApiBody<AlarmView>).id;
  }

  it('appointment refines at 2h (stage1) then 30m (stage2)', async () => {
    const id = await createApptAlarm();
    await h.prisma.user.update({
      where: { id: user.user.id },
      data: { oneSignalSubscriptionId: 'ap-sub' },
    });

    // 발사 90분 전 → stage1 (2시간 이내, 30분 밖)
    const now = new Date();
    await h.prisma.alarm.update({
      where: { id },
      data: { time: kstPlus(now, 90), appointmentRefineStage: 0 },
    });
    expect(await refine.refineDue(now)).toBe(1);
    let a = await h.prisma.alarm.findUnique({ where: { id } });
    expect(a?.appointmentRefineStage).toBe(1);
    expect(h.oneSignal.sendDataPush).toHaveBeenCalledTimes(1);
    expect(h.oneSignal.sendDataPush.mock.calls[0][1].type).toBe('APPOINTMENT_UPDATED');

    // 같은 윈도우 재호출 → 중복 안 함
    expect(await refine.refineDue(now)).toBe(0);

    // 발사 20분 전 → stage2
    await h.prisma.alarm.update({ where: { id }, data: { time: kstPlus(now, 20) } });
    expect(await refine.refineDue(now)).toBe(1);
    a = await h.prisma.alarm.findUnique({ where: { id } });
    expect(a?.appointmentRefineStage).toBe(2);
  });

  it('appointment does NOT refine more than 2h before firing', async () => {
    const id = await createApptAlarm();
    const now = new Date();
    await h.prisma.alarm.update({
      where: { id },
      data: { time: kstPlus(now, 200), appointmentRefineStage: 0 }, // 200분 후
    });
    expect(await refine.refineDue(now)).toBe(0);
    const a = await h.prisma.alarm.findUnique({ where: { id } });
    expect(a?.appointmentRefineStage).toBe(0);
  });

  it('refineDue does NOT refine an alarm still far from firing', async () => {
    const alarmId = await createTransitAlarm();
    const now = new Date();
    await h.prisma.alarm.update({
      where: { id: alarmId },
      data: { time: kstPlus(now, 90), lastTransitRefined: false }, // 90분 후
    });
    const count = await refine.refineDue(now);
    expect(count).toBe(0);
    const updated = await h.prisma.alarm.findUnique({ where: { id: alarmId } });
    expect(updated?.lastTransitRefined).toBe(false);
    expect(h.oneSignal.sendDataPush).not.toHaveBeenCalled();
  });
});
