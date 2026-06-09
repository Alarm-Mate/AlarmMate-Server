import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const KST_TIMEZONE = 'Asia/Seoul';

export function getKstDayBoundsUtc(reference: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const zoned = toZonedTime(reference, KST_TIMEZONE);
  const year = zoned.getFullYear();
  const month = zoned.getMonth();
  const day = zoned.getDate();

  const startZoned = new Date(year, month, day, 0, 0, 0, 0);
  const endZoned = new Date(year, month, day, 23, 59, 59, 999);

  return {
    start: fromZonedTime(startZoned, KST_TIMEZONE),
    end: fromZonedTime(endZoned, KST_TIMEZONE),
  };
}

export function getKstDateString(reference: Date = new Date()): string {
  return formatInTimeZone(reference, KST_TIMEZONE, 'yyyy-MM-dd');
}

export function getKstDayBoundsUtcForDateString(dateString: string): {
  start: Date;
  end: Date;
} {
  const reference = fromZonedTime(`${dateString}T12:00:00`, KST_TIMEZONE);
  return getKstDayBoundsUtc(reference);
}

export function kstDateStringDaysAgo(days: number, reference: Date = new Date()): string {
  const zoned = toZonedTime(reference, KST_TIMEZONE);
  zoned.setDate(zoned.getDate() - days);
  return formatInTimeZone(
    fromZonedTime(zoned, KST_TIMEZONE),
    KST_TIMEZONE,
    'yyyy-MM-dd',
  );
}

export function toKstDateString(date: Date): string {
  return formatInTimeZone(date, KST_TIMEZONE, 'yyyy-MM-dd');
}

/** "yyyy-MM-dd" 의 전날 문자열. */
function prevDateString(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 기상한 KST 날짜 목록에서 "현재 연속 스트릭"을 계산한다(저장 카운터 대신 사실 기반).
 * - 오늘 기상했으면 오늘부터, 아직이면 어제부터 거꾸로 연속된 날짜 수를 센다.
 * - 오늘·어제 모두 없으면 0(끊김).
 */
export function currentStreakFromDates(
  dateStrings: Iterable<string>,
  today: string = getKstDateString(),
): number {
  const set = new Set(dateStrings);
  if (set.size === 0) return 0;
  let cursor = set.has(today) ? today : prevDateString(today);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = prevDateString(cursor);
  }
  return streak;
}
