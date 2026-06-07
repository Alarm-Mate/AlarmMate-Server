import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PlaceResult {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  /** 기준 좌표로부터의 거리(m). */
  distanceM: number;
}

const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

// 키 없을 때 데모용 목 장소.
const MOCK_PLACES = [
  { id: 'm1', name: '해운대 CGV', address: '부산 해운대구', lat: 35.1631, lng: 129.1639 },
  { id: 'm2', name: '센텀시티 CGV', address: '부산 해운대구 센텀', lat: 35.1693, lng: 129.1295 },
  { id: 'm3', name: '서면 CGV', address: '부산 부산진구 서면', lat: 35.1577, lng: 129.0595 },
  { id: 'm4', name: '남포 CGV', address: '부산 중구 남포동', lat: 35.0986, lng: 129.0303 },
  { id: 'm5', name: '강남역', address: '서울 강남구', lat: 37.4979, lng: 127.0276 },
];

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(private readonly config: ConfigService) {}

  /** 키워드 장소 검색. Kakao Local(REST) 프록시. 키 없으면 목 데이터. */
  async search(query: string, lat?: number, lng?: number): Promise<PlaceResult[]> {
    const q = query.trim();
    const apiKey = this.config.get<string>('KAKAO_REST_API_KEY');

    if (!apiKey || apiKey.startsWith('placeholder')) {
      return this.mockSearch(q, lat, lng);
    }

    // 정확도순(기본)으로 검색해야 검색어와 일치하는 장소가 상단에 온다.
    // (거리순으로 하면 먼 정확한 결과가 가까운 부분일치에 밀려 안 보임)
    const params = new URLSearchParams({ query: q, size: '15', sort: 'accuracy' });
    if (lat !== undefined && lng !== undefined) {
      // x/y 는 거리(distance) 계산용으로만 전달(정렬은 정확도순 유지).
      params.set('x', String(lng));
      params.set('y', String(lat));
    }
    try {
      const res = await fetch(`${KAKAO_KEYWORD_URL}?${params.toString()}`, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
      });
      if (!res.ok) {
        this.logger.error(`Kakao search failed: ${res.status}`);
        return this.mockSearch(q, lat, lng);
      }
      const json = (await res.json()) as {
        documents: Array<{
          id: string;
          place_name: string;
          road_address_name?: string;
          address_name?: string;
          x: string;
          y: string;
          distance?: string;
        }>;
      };
      return json.documents.map((d) => ({
        id: d.id,
        name: d.place_name,
        address: d.road_address_name || d.address_name,
        lat: Number(d.y),
        lng: Number(d.x),
        distanceM: d.distance
          ? Number(d.distance)
          : lat !== undefined && lng !== undefined
            ? haversineM(lat, lng, Number(d.y), Number(d.x))
            : 0,
      }));
    } catch (error) {
      this.logger.error(
        'Kakao search request error',
        error instanceof Error ? error.stack : String(error),
      );
      return this.mockSearch(q, lat, lng);
    }
  }

  private mockSearch(q: string, lat?: number, lng?: number): PlaceResult[] {
    const base = lat !== undefined && lng !== undefined ? { lat, lng } : MOCK_PLACES[0];
    return MOCK_PLACES.filter((p) => q.length === 0 || p.name.includes(q))
      .map((p) => ({
        ...p,
        distanceM: haversineM(base.lat, base.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);
  }
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
