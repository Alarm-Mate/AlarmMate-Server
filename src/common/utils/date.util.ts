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
