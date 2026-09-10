import { describe, expect, test } from 'bun:test';
import { museWeeklyResetMs } from '@/features/quota/museResetSchedule';

describe('museWeeklyResetMs', () => {
  test('returns the next Sunday 7 PM America/Chicago', () => {
    // Thu Sep 10, 2026 afternoon Chicago -> Sun Sep 13, 2026 7:00 PM
    const now = new Date(2026, 8, 10, 15, 0).getTime();
    const reset = museWeeklyResetMs(now);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(reset));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    expect(read('weekday')).toBe('Sun');
    expect(read('month')).toBe('09');
    expect(read('day')).toBe('13');
    expect(read('hour')).toBe('19');
    expect(read('minute')).toBe('00');
    expect(reset).toBeGreaterThan(now);
  });

  test('finds Sunday 7 PM even when now is off the 15-minute grid', () => {
    // Thu Sep 10, 2026 3:47 PM local — old 15-minute probe could miss :00.
    const now = new Date(2026, 8, 10, 15, 47).getTime();
    const reset = museWeeklyResetMs(now);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(reset));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    expect(read('weekday')).toBe('Sun');
    expect(read('hour')).toBe('19');
    expect(read('minute')).toBe('00');
    expect(reset - now).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });
});
