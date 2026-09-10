/** Muse High Usage weekly reset: Sunday 19:00 America/Chicago. */

import { DAY_MS } from '@/utils/time/durations';

export const MUSE_WEEKLY_RESET_TIMEZONE = 'America/Chicago';
export const MUSE_WEEKLY_RESET_HOUR = 19;
export const MUSE_WEEKLY_RESET_MINUTE = 0;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const chicagoParts = (ms: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MUSE_WEEKLY_RESET_TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    weekday: read('weekday'),
    hour: Number(read('hour')),
    minute: Number(read('minute')),
  };
};

/** Next Sunday 7:00 PM in America/Chicago, strictly after `nowMs`. */
export function museWeeklyResetMs(nowMs: number = Date.now()): number {
  const minuteMs = 60 * 1000;
  const limit = nowMs + 8 * DAY_MS;
  for (let probe = nowMs + minuteMs; probe <= limit; probe += minuteMs) {
    const { weekday, hour, minute } = chicagoParts(probe);
    if (
      WEEKDAY[weekday] === 0 &&
      hour === MUSE_WEEKLY_RESET_HOUR &&
      minute === MUSE_WEEKLY_RESET_MINUTE
    ) {
      return probe;
    }
  }
  return nowMs + 7 * DAY_MS;
}
