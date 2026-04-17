import type { Time } from 'lightweight-charts';

/**
 * Maps fixed-offset strings from the user profile (e.g. "+04:00") to IANA Etc/GMT* zones.
 * POSIX "Etc/GMT" signs are inverted: UTC+4 → Etc/GMT-4
 */
function offsetToEtcGmt(timezoneOffset: string | undefined | null): string | undefined {
  if (!timezoneOffset || timezoneOffset.length !== 6) return undefined;
  if (timezoneOffset[0] !== '+' && timezoneOffset[0] !== '-') return undefined;
  const h = parseInt(timezoneOffset.slice(1, 3), 10);
  const m = parseInt(timezoneOffset.slice(4, 6), 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  if (m !== 0) return undefined;
  const inverted = timezoneOffset[0] === '-' ? '+' : '-';
  return `Etc/GMT${inverted}${h}`;
}

function manualWallClockMs(utcMs: number, timezoneOffset: string): number {
  const sign = timezoneOffset[0] === '-' ? -1 : 1;
  const offsetHours = parseInt(timezoneOffset.slice(1, 3), 10);
  const offsetMinutes = parseInt(timezoneOffset.slice(4, 6), 10);
  const totalOffsetMinutes = sign * (offsetHours * 60 + offsetMinutes);
  return utcMs + totalOffsetMinutes * 60 * 1000;
}

/**
 * Format a UTC instant in the user's chosen offset (profile) or browser local if unset.
 */
export function formatInUserTimezone(
  date: Date,
  timezoneOffset: string | undefined | null,
  options: Intl.DateTimeFormatOptions,
): string {
  const tz = offsetToEtcGmt(timezoneOffset);
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-US', { ...options, timeZone: tz }).format(date);
    } catch {
      /* fall through */
    }
  }
  if (timezoneOffset && timezoneOffset.length === 6 && (timezoneOffset[0] === '+' || timezoneOffset[0] === '-')) {
    const wall = new Date(manualWallClockMs(date.getTime(), timezoneOffset));
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(wall);
  }
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export type TimeDisplayFormatMode = 'full' | 'time' | 'date' | 'default';

function isDefaultOrUnset(f: TimeDisplayFormatMode | undefined): f is undefined | 'default' {
  return f === undefined || f === 'default';
}

/** Same rules as the old TimeDisplay (weekday + time default; full = weekday + month day + time, no year). */
export function formatTimeDisplayParts(
  date: Date,
  timezoneOffset: string | undefined | null,
  format: TimeDisplayFormatMode | undefined,
): string {
  if (isDefaultOrUnset(format)) {
    const wd = formatInUserTimezone(date, timezoneOffset, { weekday: 'long' });
    const tm = formatInUserTimezone(date, timezoneOffset, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${wd}, ${tm}`;
  }
  if (format === 'time') {
    return formatInUserTimezone(date, timezoneOffset, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (format === 'date') {
    const wd = formatInUserTimezone(date, timezoneOffset, { weekday: 'long' });
    const md = formatInUserTimezone(date, timezoneOffset, { month: 'short', day: 'numeric' });
    return `${wd}, ${md}`;
  }
  if (format === 'full') {
    const wd = formatInUserTimezone(date, timezoneOffset, { weekday: 'long' });
    const md = formatInUserTimezone(date, timezoneOffset, { month: 'short', day: 'numeric' });
    const tm = formatInUserTimezone(date, timezoneOffset, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${wd}, ${md}, ${tm}`;
  }
  const wd = formatInUserTimezone(date, timezoneOffset, { weekday: 'long' });
  const tm = formatInUserTimezone(date, timezoneOffset, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${wd}, ${tm}`;
}

export function getTimezoneLabelForDisplay(timezoneOffset: string | undefined | null): string {
  if (!timezoneOffset || timezoneOffset === 'Z') return 'UTC';
  const sign = timezoneOffset[0];
  const h = parseInt(timezoneOffset.slice(1, 3), 10);
  const m = parseInt(timezoneOffset.slice(4, 6), 10);
  if (!Number.isFinite(h)) return 'UTC';
  if (m === 0) return `UTC${sign}${h}`;
  return `UTC${sign}${h}:${timezoneOffset.slice(4, 6)}`;
}

/** lightweight-charts: unix seconds → label aligned with profile timezone (or browser local). */
export function formatChartTimeForUser(time: Time, timezoneOffset: string | undefined | null): string {
  let ms: number;
  if (typeof time === 'number') {
    ms = time * 1000;
  } else if (typeof time === 'object' && time !== null && 'year' in time) {
    const b = time as { year: number; month: number; day: number };
    ms = Date.UTC(b.year, b.month - 1, b.day);
  } else {
    return '';
  }
  const d = new Date(ms);
  return formatInUserTimezone(d, timezoneOffset, {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
