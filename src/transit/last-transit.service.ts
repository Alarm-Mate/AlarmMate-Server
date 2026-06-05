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
            }>;
          }>;
        };
      };
      const first = json.result?.path?.[0];
      if (!first?.subPath) return null;

      const firstWalk = first.subPath.find((s) => s.trafficType === 3);
      const firstTransit = first.subPath.find((s) => s.trafficType === 1 || s.trafficType === 2);
      const walkMinutes = firstWalk?.sectionTime ?? this.walkMinutesByDistance(origin, dest);
      const boardingStopName = firstTransit?.startName ?? '가까운 정류장';
      // TODO: 정류장 시간표 API로 실제 막차 시각. 임시 기본값.
      const lastDeparture = '23:50';
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
    const lastDeparture = '23:50';
    return {
      lastDeparture,
      boardingStopName: '가까운 정류장',
      walkMinutes,
      fireTime: subtractMinutes(lastDeparture, walkMinutes + BUFFER_MIN),
    };
  }

  private walkMinutesByDistance(origin: TransitPoint, dest: TransitPoint): number {
    const d = haversineM(origin.lat, origin.lng, dest.lat, dest.lng);
    // 정류장까지 도보는 보통 출발지 근처 → 전체 거리의 일부로 보수적 추정.
    return Math.max(3, Math.round(Math.min(d, 1000) / WALK_SPEED_M_PER_MIN));
  }
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
