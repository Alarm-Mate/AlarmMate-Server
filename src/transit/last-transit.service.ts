import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { haversineM } from './places.service';

export interface TransitPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface LastTransitComputation {
  /** 알람 울릴 시각 "HH:mm" = 막차출발 − 도보 − 5분 */
  fireTime: string;
  /** 막차 출발 "HH:mm" */
  lastDeparture: string;
  boardingStopName: string;
  walkMinutes: number;
}

const BUFFER_MIN = 5; // 여유 시간
const WALK_SPEED_M_PER_MIN = 67; // 약 4km/h
const ODSAY_PATH_URL = 'https://api.odsay.com/v1/api/searchPubTransPathT';
const ODSAY_SUBWAY_TT_URL = 'https://api.odsay.com/v1/api/subwayTimeTable';
const DEFAULT_LAST_DEPARTURE = '23:50';

@Injectable()
export class LastTransitService {
  private readonly logger = new Logger(LastTransitService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * 출발지 → 목적지 막차를 계산해 알람 울릴 시각을 낸다.
   * ODsay 키가 있으면 실제 대중교통 경로/막차 시각을, 없으면 추정값을 쓴다.
   */
  async compute(origin: TransitPoint, dest: TransitPoint): Promise<LastTransitComputation> {
    const apiKey = this.config.get<string>('ODSAY_API_KEY');
    if (apiKey && !apiKey.startsWith('placeholder')) {
      const real = await this.computeWithOdsay(origin, dest, apiKey);
      if (real) return real;
    }
    return this.estimate(origin, dest);
  }

  /**
   * ODsay 대중교통 경로 조회 → 첫 탑승 정류장/도보 + 막차 시각.
   * TODO: ODsay 경로(subPath)의 첫 대중교통 구간 정류장 시간표로 정확한 막차 시각 산출.
   *       지금은 경로의 도보 구간만 활용하고 막차 시각은 보수적 기본값을 쓴다.
   */
  private async computeWithOdsay(
    origin: TransitPoint,
    dest: TransitPoint,
    apiKey: string,
  ): Promise<LastTransitComputation | null> {
    const params = new URLSearchParams({
      apiKey,
      SX: String(origin.lng),
      SY: String(origin.lat),
      EX: String(dest.lng),
      EY: String(dest.lat),
      OPT: '0',
    });
    try {
      const res = await fetch(`${ODSAY_PATH_URL}?${params.toString()}`);
      if (!res.ok) {
        this.logger.error(`ODsay failed: ${res.status}`);
        return null;
      }
      const json = (await res.json()) as {
        result?: {
          path?: Array<{
            subPath?: Array<{
              trafficType: number; // 1=지하철 2=버스 3=도보
              sectionTime?: number; // 분
              startName?: string;
              startID?: number; // ODsay 역 ID(지하철)
              wayCode?: number; // 방향 1/2
              startX?: number; // 탑승지 경도
              startY?: number; // 탑승지 위도
            }>;
          }>;
        };
      };
      const first = json.result?.path?.[0];
      if (!first?.subPath) return null;

      const firstWalk = first.subPath.find((s) => s.trafficType === 3);
      const firstTransit = first.subPath.find((s) => s.trafficType === 1 || s.trafficType === 2);
      const boardingStopName = firstTransit?.startName ?? '가까운 정류장';
      // 출발지 → 탑승역/정류장까지의 도보 시간을 반드시 포함한다.
      // ODsay 도보 구간(sectionTime)과 좌표 기반(직선거리/도보속도) 중 큰 값을 사용.
      const odsayWalk = firstWalk?.sectionTime ?? 0;
      let coordWalk = 0;
      if (firstTransit?.startX && firstTransit?.startY) {
        const d = haversineM(origin.lat, origin.lng, firstTransit.startY, firstTransit.startX);
        coordWalk = Math.max(1, Math.round(d / WALK_SPEED_M_PER_MIN));
      }
      let walkMinutes = Math.max(odsayWalk, coordWalk);
      if (walkMinutes <= 0) walkMinutes = this.walkMinutesByDistance(origin, dest);
      // 첫 탑승이 지하철이면 해당 역 시간표로 실제 막차 시각을 조회. 실패 시 기본값.
      let lastDeparture = DEFAULT_LAST_DEPARTURE;
      if (firstTransit?.trafficType === 1 && firstTransit.startID) {
        const real = await this.getSubwayLastTrain(firstTransit.startID, firstTransit.wayCode ?? 1, apiKey);
        if (real) lastDeparture = real;
      }
      return {
        lastDeparture,
        boardingStopName,
        walkMinutes,
        fireTime: subtractMinutes(lastDeparture, walkMinutes + BUFFER_MIN),
      };
    } catch (error) {
      this.logger.error(
        'ODsay request error',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /** 키 없을 때 추정: 도보는 직선거리 기반, 막차는 보수적 기본값. */
  private estimate(origin: TransitPoint, dest: TransitPoint): LastTransitComputation {
    const walkMinutes = Math.min(20, this.walkMinutesByDistance(origin, dest));
    const lastDeparture = DEFAULT_LAST_DEPARTURE;
    return {
      lastDeparture,
      boardingStopName: '가까운 정류장',
      walkMinutes,
      fireTime: subtractMinutes(lastDeparture, walkMinutes + BUFFER_MIN),
    };
  }

  /**
   * 출발지 → 목적지 총 이동 시간(분). 약속 알람용.
   * ODsay 경로 총 소요시간 사용, 키 없으면 거리 기반 추정.
   */
  async computeTravelMinutes(origin: TransitPoint, dest: TransitPoint): Promise<number> {
    const apiKey = this.config.get<string>('ODSAY_API_KEY');
    if (apiKey && !apiKey.startsWith('placeholder')) {
      const params = new URLSearchParams({
        apiKey,
        SX: String(origin.lng),
        SY: String(origin.lat),
        EX: String(dest.lng),
        EY: String(dest.lat),
        OPT: '0',
      });
      try {
        const res = await fetch(`${ODSAY_PATH_URL}?${params.toString()}`);
        if (res.ok) {
          const json = (await res.json()) as {
            result?: { path?: Array<{ info?: { totalTime?: number } }> };
          };
          const total = json.result?.path?.[0]?.info?.totalTime;
          if (typeof total === 'number' && total > 0) return total;
        }
      } catch (error) {
        this.logger.error(
          'ODsay travel time error',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    // 추정: 직선거리 → 대중교통 대략 속도(도보 포함 ~18km/h)
    const d = haversineM(origin.lat, origin.lng, dest.lat, dest.lng);
    return Math.max(5, Math.round(d / 300));
  }

  /**
   * 지하철 역 시간표에서 해당 방향의 막차(가장 늦은) 출발 시각 "HH:mm"을 조회한다.
   * 응답 구조가 다양할 수 있어, 시간표 객체에서 "HH:mm" 토큰만 모아 가장 늦은 값을 막차로 본다.
   * 자정 이후 첫차(00:xx)보다 23:xx 가 크므로 max 가 막차에 해당한다.
   */
  private async getSubwayLastTrain(
    stationID: number,
    wayCode: number,
    apiKey: string,
  ): Promise<string | null> {
    const params = new URLSearchParams({
      apiKey,
      stationID: String(stationID),
      wayCode: String(wayCode),
      dayType: String(this.todayDayType()),
    });
    try {
      const res = await fetch(`${ODSAY_SUBWAY_TT_URL}?${params.toString()}`);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        result?: { OdsayTimeTable?: { fwd?: unknown; bwd?: unknown } };
      };
      const tt = json.result?.OdsayTimeTable;
      if (!tt) return null;
      const dir = wayCode === 2 ? tt.bwd : tt.fwd;
      // 선택 방향의 시간표만 사용. 해당 방향이 비어 있을 때만 양방향으로 폴백.
      let times = collectHHMM(dir);
      if (times.length === 0) times = collectHHMM(tt.fwd).concat(collectHHMM(tt.bwd));
      if (times.length === 0) return null;
      let maxMin = -1;
      let best: string | null = null;
      for (const t of times) {
        const m = toMinutes(t);
        if (m > maxMin) {
          maxMin = m;
          best = t;
        }
      }
      return best;
    } catch (error) {
      this.logger.error(
        'ODsay subway timetable error',
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /** KST 기준 요일 → ODsay dayType (1=평일, 2=토, 3=일/공휴일). */
  private todayDayType(): number {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const day = kst.getUTCDay(); // 0=일..6=토
    if (day === 6) return 2;
    if (day === 0) return 3;
    return 1;
  }

  private walkMinutesByDistance(origin: TransitPoint, dest: TransitPoint): number {
    const d = haversineM(origin.lat, origin.lng, dest.lat, dest.lng);
    // 정류장까지 도보는 보통 출발지 근처 → 전체 거리의 일부로 보수적 추정.
    return Math.max(3, Math.round(Math.min(d, 1000) / WALK_SPEED_M_PER_MIN));
  }
}

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** 임의 객체에서 "HH:mm" 형태 문자열만 재귀적으로 수집. */
function collectHHMM(value: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === 'string') {
      if (HHMM_RE.test(v)) out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return out;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/** "HH:mm" 에서 분을 빼서 "HH:mm" 반환(24시간 랩어라운드). */
export function subtractMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  let total = h * 60 + m - minutes;
  total = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
