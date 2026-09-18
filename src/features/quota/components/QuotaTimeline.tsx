/**
 * Quota windows timeline.
 *
 * The cards answer "how much is left"; this answers "when does it come back,
 * and does it all come back at once". Four credentials resetting the same
 * evening is a very different position from four staggered across a week, and
 * no per-card percentage shows that.
 *
 * All projection maths lives in quotaTimelineModel.ts — this file is layout
 * only. (The model is named ...Model rather than matching this component,
 * because a case-insensitive filesystem cannot hold both QuotaTimeline.tsx and
 * quotaTimeline.ts.)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import { formatRelativeInstant, TYPE_COLORS } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme, ThemeColors } from '@/types';
import {
  buildTimelineLane,
  buildTimelineLanes,
  laneHasWindow,
  projectLane,
  projectResetCredits,
  scheduledRemainingAt,
  currentWindowSpan,
  extendSpanToCoverNextWindows,
  addCalendarDays,
  timelineSpanZoomed,
  zoomSpanAtAnchor,
  zoomCurrentSpan,
  visibleUsedPercent,
  TIMELINE_ZOOM_BOUNDS,
} from '../quotaTimelineModel';
import type { TimelineLane, TimelineMode } from '../quotaTimelineModel';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import styles from './QuotaTimeline.module.scss';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const TIMELINE_TIME_ZONE = 'America/Chicago';
const TIMELINE_LANE_WIDTH_PX = 210;
const EN_WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const TIMELINE_ACCENTS = {
  claude: { light: '#c05621', dark: '#e8a882' },
  fable: { light: '#7c3aed', dark: '#c4b5fd' },
  cursor: { light: '#1a1a1a', dark: '#e8e8e8' },
  muse: { light: '#1c4ed8', dark: '#93c5fd' },
  xai: { light: '#0f766e', dark: '#5eead4' },
  codex: { light: '#3538d4', dark: '#a5b4fc' },
} as const;

const centralParts = (ms: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMELINE_TIME_ZONE,
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    weekday: read('weekday'),
  };
};

const formatDay = (ms: number) => {
  const part = centralParts(ms);
  return `${part.month}/${part.day}`;
};
const formatTime = (ms: number) => {
  const part = centralParts(ms);
  return `${part.hour}:${part.minute}`;
};
const weekdayIndex = (ms: number) => EN_WEEKDAY_INDEX[centralParts(ms).weekday] ?? 0;

type TimelineSpan = { startMs: number; endMs: number; days: number };
type TimelineViewportAnchor = { atMs: number; position: number };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function captureViewportAnchor(
  chart: HTMLDivElement | null,
  span: TimelineSpan
): TimelineViewportAnchor {
  if (!chart) {
    const position = 0.5;
    return { atMs: span.startMs + (span.endMs - span.startMs) * position, position };
  }

  const calendarWidth = Math.max(1, chart.scrollWidth - TIMELINE_LANE_WIDTH_PX);
  const visibleStart = chart.scrollLeft + Math.min(TIMELINE_LANE_WIDTH_PX, chart.clientWidth);
  const visibleEnd = chart.scrollLeft + chart.clientWidth;
  const position = clamp(
    ((visibleStart + visibleEnd) / 2 - TIMELINE_LANE_WIDTH_PX) / calendarWidth,
    0,
    1
  );
  // Keep the date under the visual center, rather than reusing its old span
  // fraction. A tight zoom may no longer have enough horizontal overflow to
  // restore that fraction; centering the captured date still works at every
  // zoom level and through a viewport resize.
  return { atMs: span.startMs + (span.endMs - span.startMs) * position, position: 0.5 };
}

function scrollTimelineBy(
  chart: HTMLDivElement | null,
  distance: number,
  behavior: ScrollBehavior = 'auto'
) {
  if (!chart || !Number.isFinite(distance) || distance === 0) return;
  chart.scrollBy({ left: distance, behavior });
}

export interface QuotaTimelineProps {
  entries: QuotaFileEntry[];
  /**
   * Quota state for an entry. An entry carries only the file and its provider —
   * loaded quota lives in the store — so the lookup is injected rather than read
   * off the entry, and lanes see exactly what the cards see.
   */
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  displayNameFor: (name: string) => string;
  resolvedTheme: ResolvedTheme;
  /** Injectable for tests/screenshots; defaults to the real clock. */
  now?: number;
  /** Injectable initial zoom for tests/screenshots; defaults to the weekly view. */
  initialMode?: TimelineMode;
  /** Injectable initial date offset for tests/screenshots; defaults to the current period. */
  initialOffset?: number;
  /** Injectable initial zoom day-count for tests/screenshots. */
  initialZoomDays?: number;
  /**
   * Refresh-all wiring, owned by the page. The windows panel shows the same
   * credentials as the cards above, so it offers the same refresh action rather
   * than a second, divergent fetch path.
   */
  refreshing?: boolean;
  disableControls?: boolean;
  onRefreshAll?: () => void;
}

export function QuotaTimeline({
  entries,
  quotaFor,
  displayNameFor,
  resolvedTheme,
  now: nowProp,
  initialMode = 'weekly',
  initialOffset = 0,
  initialZoomDays,
  refreshing = false,
  disableControls = false,
  onRefreshAll,
}: QuotaTimelineProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TimelineMode>(initialMode);
  const [offset, setOffset] = useState(initialOffset);
  const [fitCurrent, setFitCurrent] = useState(initialZoomDays === undefined);
  const [zoomDays, setZoomDays] = useState(
    initialZoomDays ?? TIMELINE_ZOOM_BOUNDS[initialMode].default
  );
  const [zoomAnchor, setZoomAnchor] = useState<TimelineViewportAnchor | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const pendingViewportAnchor = useRef<TimelineViewportAnchor | null>(null);
  const visibleViewportAnchor = useRef<TimelineViewportAnchor | null>(null);
  const resizeViewportAnchor = useRef<TimelineViewportAnchor | null>(null);
  const preserveZoomAnchor = useRef(false);
  const restoringScroll = useRef(false);
  const restoredScrollLeft = useRef<number | null>(null);
  const zoomBounds = TIMELINE_ZOOM_BOUNDS[mode];

  // The clock has to advance on its own: bars are classified past/live/next
  // against it and the marker is positioned by it, so a long-lived tab would
  // quietly go stale. Shared app-wide so the cards above tick in lockstep with
  // the chart rather than each running its own timer.
  const tick = useNow(nowProp === undefined); // fixed clock: tests and screenshots
  const now = nowProp ?? tick;

  const baseSpan = useMemo(
    () => timelineSpanZoomed(mode, offset, now, zoomDays),
    [mode, offset, now, zoomDays]
  );
  const todayLabel = t('quota_management.windows_today', { defaultValue: 'Today' });
  const scrollGroupLabel = t('quota_management.windows_scroll_group', {
    defaultValue: 'Timeline scrolling',
  });
  const scrollHint = t('quota_management.windows_scroll_hint', {
    defaultValue: 'Shift + mouse wheel scrolls sideways',
  });
  const scrollLeftLabel = t('quota_management.windows_scroll_left', {
    defaultValue: 'Scroll timeline left',
  });
  const scrollRightLabel = t('quota_management.windows_scroll_right', {
    defaultValue: 'Scroll timeline right',
  });
  const chartLabel = t('quota_management.windows_timeline_label', {
    defaultValue: 'Quota window timeline',
  });
  // This button doubles as the selected-period indicator and the shortcut back
  // to the current period. Keeping its visible text hard-coded to "Today" made
  // successful previous/next navigation look as though the date never changed.
  const navigationLabel = offset === 0 ? todayLabel : formatDay(baseSpan.startMs);

  const laneInputs = useMemo(
    () =>
      entries.map((entry) => ({
        name: entry.file.name,
        displayName: displayNameFor(entry.file.name),
        provider: entry.type,
        quota: quotaFor(entry),
      })),
    [entries, quotaFor, displayNameFor]
  );

  // Keep the timeline hidden until at least one loaded credential exposes a
  // real quota window. Once there is timeline data, however, changing zoom must
  // never remove the whole panel just because that mode has no matching lanes.
  const hasAnyLane = useMemo(
    () => laneInputs.some((input) => laneHasWindow(buildTimelineLane(input))),
    [laneInputs]
  );

  const lanes = useMemo(
    () =>
      laneInputs
        .flatMap((input) =>
          buildTimelineLanes({
            ...input,
            nowMs: now,
            // Weekly mode prefers the longest readable window. Session mode
            // asks specifically for a real 5-hour window; longer periods must
            // not be reinterpreted as 5-hour resets.
            maxPeriodHours: mode === 'session' ? 5 : Infinity,
          })
        )
        .filter((lane) => laneHasWindow(lane) && (mode !== 'session' || lane.periodHours === 5)),
    [laneInputs, mode, now]
  );

  const span = useMemo(() => {
    // A selected previous/next period still needs the same scroll-aware zoom
    // behavior. Without this branch, dragging the slider after navigating
    // would rebuild from that period's left edge and lose the viewed date.
    if (offset !== 0) {
      if (!zoomAnchor) return baseSpan;
      return zoomSpanAtAnchor(baseSpan, zoomAnchor.atMs, zoomAnchor.position, mode, zoomDays);
    }
    const current = currentWindowSpan(lanes, now, TIMELINE_ZOOM_BOUNDS[mode].default);
    // The default fit view must show what's coming: push its end out to the
    // full next window of every lane that can reasonably fit (capped so a
    // 30-day subscription cannot balloon a fortnight into a six-week view).
    // An explicit zoom or pan choice is honored exactly as chosen — the
    // slider must keep meaning what it says.
    if (!fitCurrent) {
      if (!zoomAnchor) return zoomCurrentSpan(current, now, mode, zoomDays);
      return zoomSpanAtAnchor(current, zoomAnchor.atMs, zoomAnchor.position, mode, zoomDays);
    }
    return extendSpanToCoverNextWindows(current, lanes, now, 14);
  }, [fitCurrent, offset, lanes, now, mode, baseSpan, zoomAnchor, zoomDays]);
  const displayedZoom = fitCurrent && offset === 0 ? span.days : zoomDays;

  /** Weekly: one cell per day. Session: one per 6 hours. */
  const cells = useMemo(() => {
    const zoomed = mode === 'session';
    const count = zoomed ? span.days * 4 : span.days;
    const todayKey = formatDay(now);

    return Array.from({ length: count }, (_, index) => {
      const day = Math.floor(index / (zoomed ? 4 : 1));
      const dayStart = addCalendarDays(span.startMs, day);
      const dayEnd = addCalendarDays(span.startMs, day + 1);
      const at = dayStart + (zoomed ? ((index % 4) * (dayEnd - dayStart)) / 4 : 0);
      const date = centralParts(at);
      const isDayStart = !zoomed || date.hour === '00';
      const dayIndex = weekdayIndex(at);
      return {
        at,
        widthPercent: ((dayEnd - dayStart) / (zoomed ? 4 : 1) / (span.endMs - span.startMs)) * 100,
        isDayStart,
        // Dense spans drop every other date so the labels never collide once the
        // chart is packed into the panel width instead of scrolling sideways.
        showLabel: isDayStart && (zoomed || span.days <= 18 || day % 2 === 0),
        isToday: formatDay(at) === todayKey,
        isWeekend: dayIndex === 0 || dayIndex === 6,
        weekday: t(`quota_management.weekday_${WEEKDAY_KEYS[dayIndex]}`, {
          defaultValue: WEEKDAY_KEYS[dayIndex],
        }),
        label: isDayStart ? formatDay(at) : `${date.hour}:00`,
      };
    });
  }, [mode, span, now, t]);

  // Only draw the marker when the current moment is actually on screen.
  const nowPercent =
    now >= span.startMs && now < span.endMs
      ? ((now - span.startMs) / (span.endMs - span.startMs)) * 100
      : null;

  // The calendar gets a new width after zooming. Restore the captured date to
  // the center of the visible calendar (beside the sticky credential column)
  // after React has committed that new width.
  useEffect(() => {
    const anchor = pendingViewportAnchor.current ?? visibleViewportAnchor.current;
    const chart = chartRef.current;
    if (!anchor || !chart) return;

    const calendarWidth = Math.max(1, chart.scrollWidth - TIMELINE_LANE_WIDTH_PX);
    // zoomSpanAtAnchor aligns the new span to midnight. Its requested 50%
    // position can therefore differ by hours from the anchor's actual instant;
    // restore from that actual instant so the date under the viewport survives
    // a round-trip exactly instead of drifting with each calendar rounding.
    const actualPosition = clamp(
      (anchor.atMs - span.startMs) / (span.endMs - span.startMs),
      0,
      1
    );
    const contentX = TIMELINE_LANE_WIDTH_PX + calendarWidth * actualPosition;
    const viewportCalendarCenter =
      (Math.min(TIMELINE_LANE_WIDTH_PX, chart.clientWidth) + chart.clientWidth) / 2;
    restoringScroll.current = true;
    const nextScrollLeft = clamp(
      contentX - viewportCalendarCenter,
      0,
      Math.max(0, chart.scrollWidth - chart.clientWidth)
    );
    restoredScrollLeft.current = nextScrollLeft;
    chart.scrollLeft = nextScrollLeft;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoringScroll.current = false;
      });
    });
    pendingViewportAnchor.current = null;
  }, [lanes.length, span.startMs, span.endMs]);

  // Browser zoom and responsive breakpoints change the calendar width without
  // changing the selected dates. Reapply the most recently viewed instant once
  // the new layout has settled, so a narrower or recovered viewport does not
  // make the timeline appear to jump to another day.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const rememberBeforeResize = () => {
      // A browser may emit a scroll event while recomputing the narrower
      // layout. Preserve the instant from before that layout scroll instead
      // of treating the browser's temporary clamp as an intentional pan.
      resizeViewportAnchor.current = zoomAnchor ?? visibleViewportAnchor.current;
      restoringScroll.current = true;
    };
    const restoreAfterResize = () => {
      const anchor = resizeViewportAnchor.current ?? zoomAnchor ?? visibleViewportAnchor.current;
      if (!anchor) return;
      const calendarWidth = Math.max(1, chart.scrollWidth - TIMELINE_LANE_WIDTH_PX);
      const actualPosition = clamp(
        (anchor.atMs - span.startMs) / (span.endMs - span.startMs),
        0,
        1
      );
      const contentX = TIMELINE_LANE_WIDTH_PX + calendarWidth * actualPosition;
      const viewportCalendarCenter =
        (Math.min(TIMELINE_LANE_WIDTH_PX, chart.clientWidth) + chart.clientWidth) / 2;
      restoringScroll.current = true;
      const nextScrollLeft = clamp(
        contentX - viewportCalendarCenter,
        0,
        Math.max(0, chart.scrollWidth - chart.clientWidth)
      );
      restoredScrollLeft.current = nextScrollLeft;
      chart.scrollLeft = nextScrollLeft;
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          restoringScroll.current = false;
          resizeViewportAnchor.current = null;
        });
      });
    };
    const scheduleRestore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restoreAfterResize);
    };
    const observer = new ResizeObserver(scheduleRestore);
    observer.observe(chart);
    window.addEventListener('resize', rememberBeforeResize);
    window.addEventListener('resize', scheduleRestore);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', rememberBeforeResize);
      window.removeEventListener('resize', scheduleRestore);
      cancelAnimationFrame(frame);
    };
  }, [lanes.length, span.startMs, span.endMs, zoomAnchor]);

  const handleZoomChange = (days: number) => {
    const anchor =
      preserveZoomAnchor.current && zoomAnchor
        ? zoomAnchor
        : captureViewportAnchor(chartRef.current, span);
    pendingViewportAnchor.current = anchor;
    visibleViewportAnchor.current = anchor;
    preserveZoomAnchor.current = true;
    setZoomAnchor(anchor);
    setFitCurrent(false);
    setZoomDays(days);
  };

  const resetTimelinePosition = () => {
    pendingViewportAnchor.current = null;
    visibleViewportAnchor.current = null;
    preserveZoomAnchor.current = false;
    setZoomAnchor(null);
    if (chartRef.current) chartRef.current.scrollLeft = 0;
  };

  // React registers wheel listeners as passive. Shift-wheel needs to suppress
  // the page's vertical scroll, so use a native non-passive listener instead.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      const distance = event.deltaY || event.deltaX;
      if (!distance) return;
      event.preventDefault();
      preserveZoomAnchor.current = false;
      scrollTimelineBy(chart, distance, 'auto');
    };
    const rememberViewport = () => {
      if (restoringScroll.current) return;
      // Browser layout can clamp a programmatically restored position by a few
      // pixels while a responsive width changes. Do not turn that clamp into a
      // user pan, or the next resize would preserve the wrong date.
      if (
        restoredScrollLeft.current !== null &&
        Math.abs(chart.scrollLeft - restoredScrollLeft.current) <= 12
      ) {
        return;
      }
      restoredScrollLeft.current = null;
      const anchor = captureViewportAnchor(chart, span);
      visibleViewportAnchor.current = anchor;
      setZoomAnchor(anchor);
      preserveZoomAnchor.current = false;
    };
    chart.addEventListener('wheel', handleWheel, { passive: false });
    chart.addEventListener('scroll', rememberViewport, { passive: true });
    return () => {
      chart.removeEventListener('wheel', handleWheel);
      chart.removeEventListener('scroll', rememberViewport);
    };
  });

  if (!hasAnyLane) return null;

  return (
    <section
      className={styles.timeline}
      data-span-start-ms={span.startMs}
      data-span-end-ms={span.endMs}
    >
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>
            {t('quota_management.windows_title', { defaultValue: 'Quota windows' })}
          </h2>
          <p className={styles.range}>
            {formatDay(span.startMs)} – {formatDay(span.endMs - 1)}
            {' · '}
            {mode === 'weekly'
              ? t('quota_management.windows_span_weekly', {
                  defaultValue: '{{count}} days',
                  count: span.days,
                })
              : t('quota_management.windows_span_session_days', {
                  defaultValue: '{{count}} days',
                  count: span.days,
                })}
            {' · America/Chicago'}
            {offset === 0 &&
              ` · ${t('quota_management.windows_current', { defaultValue: 'current' })}`}
          </p>
        </div>

        <div className={styles.controls}>
          <div className={styles.nav}>
            <button
              type="button"
              onClick={() => {
                resetTimelinePosition();
                setOffset((value) => value - 1);
              }}
              aria-label={t('quota_management.windows_prev', { defaultValue: 'Previous' })}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => {
                resetTimelinePosition();
                setOffset(0);
                setFitCurrent(true);
              }}
              disabled={offset === 0 && fitCurrent}
              aria-label={todayLabel}
              title={offset === 0 ? undefined : todayLabel}
            >
              {navigationLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                resetTimelinePosition();
                setOffset((value) => value + 1);
              }}
              aria-label={t('quota_management.windows_next', { defaultValue: 'Next' })}
            >
              ›
            </button>
          </div>

          <div className={styles.modes} role="group">
            {(['weekly', 'session'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  resetTimelinePosition();
                  setMode(value);
                  setOffset(0); // spans differ in size; an old offset means nothing
                  setFitCurrent(true);
                  setZoomDays(TIMELINE_ZOOM_BOUNDS[value].default);
                }}
              >
                {value === 'weekly'
                  ? t('quota_management.windows_mode_weekly', { defaultValue: 'Weekly' })
                  : t('quota_management.windows_mode_session', { defaultValue: '5-hour' })}
              </button>
            ))}
          </div>

          {onRefreshAll && (
            <button
              type="button"
              className={styles.refreshAction}
              data-quota-windows-refresh="1"
              onClick={onRefreshAll}
              disabled={disableControls || refreshing}
            >
              <IconRefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
              {t('quota_management.windows_refresh', { defaultValue: 'Refresh' })}
            </button>
          )}
        </div>
      </header>

      <div className={styles.scrollControls} role="group" aria-label={scrollGroupLabel}>
        <span className={styles.scrollHint}>{scrollHint}</span>
        <button
          type="button"
          onClick={() =>
            (() => {
              preserveZoomAnchor.current = false;
              scrollTimelineBy(
                chartRef.current,
                -Math.max(160, chartRef.current?.clientWidth ?? 0) * 0.7
              );
            })()
          }
          aria-label={scrollLeftLabel}
          title={scrollLeftLabel}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() =>
            (() => {
              preserveZoomAnchor.current = false;
              scrollTimelineBy(
                chartRef.current,
                Math.max(160, chartRef.current?.clientWidth ?? 0) * 0.7
              );
            })()
          }
          aria-label={scrollRightLabel}
          title={scrollRightLabel}
        >
          ›
        </button>
      </div>

      <div
        ref={chartRef}
        className={styles.chart}
        style={
          {
            '--timeline-min-width': `${TIMELINE_LANE_WIDTH_PX + cells.length * (mode === 'session' ? 18 : 44)}px`,
          } as CSSProperties
        }
        aria-label={chartLabel}
      >
        {lanes.length === 0 ? (
          <div className={styles.empty} role="status">
            {t('quota_management.windows_empty_session', {
              defaultValue: 'No credentials on this page report a 5-hour quota window.',
            })}
          </div>
        ) : (
          <>
            <div className={styles.axis}>
              <div className={styles.axisLabel}>
                {t('quota_management.windows_credential', { defaultValue: 'Credential' })}
              </div>
              <div className={styles.axisCells}>
                {cells.map((cell) => (
                  <div
                    key={cell.at}
                    className={styles.axisCell}
                    data-today={cell.isToday ? 1 : 0}
                    data-weekend={cell.isWeekend ? 1 : 0}
                    data-daystart={cell.isDayStart ? 1 : 0}
                    style={{ flex: `0 0 ${cell.widthPercent}%` }}
                  >
                    <span className={styles.axisWeekday}>{cell.showLabel ? cell.weekday : ''}</span>
                    <span className={styles.axisDate}>{cell.showLabel ? cell.label : ''}</span>
                  </div>
                ))}
              </div>
            </div>

            {lanes.map((lane) => (
              <Lane
                key={lane.name}
                lane={lane}
                span={span}
                now={now}
                mode={mode}
                cells={cells}
                nowPercent={nowPercent}
                resolvedTheme={resolvedTheme}
              />
            ))}
          </>
        )}
      </div>

      {lanes.length > 0 && (
        <div className={styles.zoomBar}>
          <span className={styles.zoomHint}>
            {t('quota_management.windows_zoom_in', { defaultValue: 'Zoom in' })}
          </span>
          <input
            type="range"
            className={styles.zoomSlider}
            min={zoomBounds.min}
            max={Math.max(zoomBounds.max, displayedZoom)}
            step={1}
            value={displayedZoom}
            onChange={(event) => handleZoomChange(Number(event.target.value))}
            aria-label={t('quota_management.windows_zoom_slider', {
              defaultValue: 'Timeline zoom',
            })}
            aria-valuemin={zoomBounds.min}
            aria-valuemax={Math.max(zoomBounds.max, displayedZoom)}
            aria-valuenow={displayedZoom}
            aria-valuetext={t('quota_management.windows_span_weekly', {
              defaultValue: '{{count}} days',
              count: displayedZoom,
            })}
          />
          <span className={styles.zoomHint}>
            {t('quota_management.windows_zoom_out', { defaultValue: 'Zoom out' })}
          </span>
          <span className={styles.zoomValue}>
            {mode === 'weekly'
              ? t('quota_management.windows_span_weekly', {
                  defaultValue: '{{count}} days',
                  count: span.days,
                })
              : t('quota_management.windows_span_session_days', {
                  defaultValue: '{{count}} days',
                  count: span.days,
                })}
          </span>
        </div>
      )}

      {lanes.length > 0 && (
        <footer className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchLive}`} />
            {t('quota_management.windows_legend_current', { defaultValue: 'current window' })}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchNext}`} />
            {t('quota_management.windows_legend_upcoming', { defaultValue: 'upcoming' })}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchPast}`} />
            {t('quota_management.windows_legend_elapsed', { defaultValue: 'elapsed' })}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchCredit} />
            {t('quota_management.windows_legend_reset_credit', {
              defaultValue: 'manual reset expiration',
            })}
          </span>
          <span className={styles.legendNote}>
            {mode === 'weekly'
              ? t('quota_management.windows_note_weekly', {
                  defaultValue:
                    'Each bar is one full quota window, drawn from when it opened to when it resets. Lanes ending together compete for the same days.',
                })
              : t('quota_management.windows_note_session', {
                  defaultValue:
                    'Each bar is one 5-hour window. Only credentials with a window counting down can be projected; the rest stay empty rather than invented.',
                })}
          </span>
        </footer>
      )}
    </section>
  );
}

interface LaneProps {
  lane: TimelineLane;
  span: { startMs: number; endMs: number; days: number };
  now: number;
  mode: TimelineMode;
  cells: {
    at: number;
    isWeekend: boolean;
    isDayStart: boolean;
    showLabel: boolean;
    widthPercent: number;
  }[];
  nowPercent: number | null;
  resolvedTheme: ResolvedTheme;
}

function Lane({ lane, span, now, mode, cells, nowPercent, resolvedTheme }: LaneProps) {
  const { t, i18n } = useTranslation();

  const windows = useMemo(
    () => projectLane(lane, span.startMs, span.endMs, now, mode),
    [lane, span, now, mode]
  );
  const resetCredits = useMemo(
    () => projectResetCredits(lane, span.startMs, span.endMs, now),
    [lane, span, now]
  );

  const stackedBars = useMemo(() => lane.stackedBars ?? [], [lane.stackedBars]);
  const liveWindow = windows.find((window) => window.state === 'live') ?? null;
  const paceMarks = useMemo(() => {
    if (nowPercent === null || !liveWindow) return [];
    const scheduled = scheduledRemainingAt(now, liveWindow.startMs, liveWindow.endMs);
    if (scheduled === null) return [];

    const bars =
      stackedBars.length > 0
        ? stackedBars.map((bar) => ({ id: bar.id, label: bar.label }))
        : [{ id: lane.name, label: lane.displayName }];

    return bars.map((bar, index) => ({
      ...bar,
      scheduled,
      paceText: t('quota_management.windows_now_pace', {
        defaultValue: '{{label}} on-pace: {{percent}}% remaining',
        label: '',
        percent: scheduled,
      })
        .trim()
        .split(`${scheduled}%`),
      topPercent: ((index + 0.5) / bars.length) * 100,
    }));
  }, [liveWindow, lane.displayName, lane.name, now, nowPercent, stackedBars, t]);

  const colorSet = TYPE_COLORS[lane.provider] || TYPE_COLORS.unknown;
  const color: ThemeColors =
    resolvedTheme === 'dark' && colorSet.dark ? colorSet.dark : colorSet.light;
  const risk =
    lane.remaining !== null && lane.remaining <= 25
      ? 'critical'
      : lane.remaining !== null && lane.remaining <= 50
        ? 'warning'
        : 'normal';
  const timelineColorKey = lane.name.endsWith(':fable') ? 'fable' : lane.provider;
  const timelineColor = TIMELINE_ACCENTS[timelineColorKey as keyof typeof TIMELINE_ACCENTS];
  const accent = timelineColor?.[resolvedTheme] ?? color.text;
  const nextResetMs =
    lane.anchorMs !== null && lane.periodHours
      ? lane.anchorMs +
        Math.max(0, Math.floor((now - lane.anchorMs) / (lane.periodHours * 60 * 60_000)) + 1) *
          lane.periodHours *
          60 *
          60_000
      : null;
  const nextResetLabel =
    nextResetMs === null
      ? null
      : `${t('quota_management.windows_next_reset', { defaultValue: 'Resets' })} ${t(
          `quota_management.weekday_${WEEKDAY_KEYS[weekdayIndex(nextResetMs)]}`,
          { defaultValue: WEEKDAY_KEYS[weekdayIndex(nextResetMs)] }
        )} ${formatDay(nextResetMs)} ${formatTime(nextResetMs)}`;

  // Sub-day windows are labelled in hours — rounding 5h to days gives "0d".
  const periodLabel =
    mode === 'session'
      ? '5h'
      : !lane.periodHours
        ? ''
        : lane.periodHours < 24
          ? `${Math.round(lane.periodHours)}h`
          : `${Math.round(lane.periodHours / 24)}d`;

  return (
    <div
      className={styles.lane}
      data-timeline-lane={lane.name}
      data-quota-risk={risk}
      data-stacked={stackedBars.length > 0 ? 1 : 0}
      style={{ '--provider-accent': accent } as CSSProperties}
    >
      <div className={styles.laneHead}>
        <div className={styles.laneTop}>
          <span className={styles.laneDot} />
          <span className={styles.laneName} title={lane.displayName}>
            {lane.displayName}
          </span>
          {periodLabel && !lane.compactHead && (
            <span className={styles.lanePeriod}>{periodLabel}</span>
          )}
        </div>
        {nextResetLabel && (
          <div className={styles.nextReset} data-next-reset-ms={nextResetMs}>
            {nextResetLabel}
          </div>
        )}
        {liveWindow && (
          <div
            className={styles.nextReset}
            data-window-start-ms={liveWindow.startMs}
            data-window-end-ms={liveWindow.endMs}
          >
            {formatDay(liveWindow.startMs)} {formatTime(liveWindow.startMs)} →{' '}
            {formatDay(liveWindow.endMs)} {formatTime(liveWindow.endMs)}
          </div>
        )}
        {lane.limits.length > 0 && (
          <div className={styles.laneLimits}>
            {lane.limits.map((limit) => (
              <span key={limit.label} className={styles.laneLimit}>
                {limit.label} <b>{limit.remaining}%</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.track}>
        <div className={styles.trackGrid}>
          {cells.map((cell) => (
            <span
              key={cell.at}
              data-weekend={cell.isWeekend ? 1 : 0}
              data-daystart={cell.isDayStart ? 1 : 0}
              style={{ flex: `0 0 ${cell.widthPercent}%` }}
            />
          ))}
        </div>

        {nowPercent !== null && (
          <div className={styles.nowLine} style={{ left: `${nowPercent}%` }} />
        )}

        {paceMarks.map((mark) => (
          <span
            key={mark.id}
            className={styles.nowMark}
            style={{ left: `${nowPercent}%`, top: `${mark.topPercent}%` }}
            title={t('quota_management.windows_now_pace', {
              defaultValue: '{{label}} on-pace: {{percent}}% remaining',
              label: mark.label,
              percent: mark.scheduled,
            })}
          >
            <span className={styles.nowMarkPercent}>{mark.scheduled}%</span>
          </span>
        ))}

        {windows.length === 0 ? (
          <span className={styles.laneIdle}>
            {t('quota_management.windows_idle', {
              defaultValue: 'no window counting down',
            })}
          </span>
        ) : (
          windows.map((window) => {
            // A label needs room to read; below that the bar speaks for itself
            // and the detail lives in the tooltip.
            const showLabel = window.widthPercent > (mode === 'session' ? 4.5 : 9);
            const endText =
              mode === 'session'
                ? formatTime(window.endMs)
                : `${formatDay(window.endMs)} ${formatTime(window.endMs)}`;

            if (
              stackedBars.length > 0 &&
              window.state === 'live' &&
              window.endMs === lane.anchorMs
            ) {
              return (
                <div
                  key={window.startMs}
                  className={styles.stackedWindow}
                  data-window-state={window.state}
                  data-clipped-start={window.startMs < span.startMs ? 1 : 0}
                  data-clipped-end={window.endMs > span.endMs ? 1 : 0}
                  data-window-start-ms={window.startMs}
                  data-window-end-ms={window.endMs}
                  style={{ left: `${window.leftPercent}%`, width: `${window.widthPercent}%` }}
                  title={stackedBars
                    .map((bar) =>
                      bar.remaining === null
                        ? bar.label
                        : `${bar.label}: ${bar.remaining}% remaining`
                    )
                    .join('\n')}
                >
                  {stackedBars.map((bar) => {
                    const usedPastHalf = bar.remaining !== null && bar.remaining <= 50;
                    const pct = bar.remaining === null ? '--' : `${Math.round(bar.remaining)}%`;
                    const barAccent =
                      bar.tone === 'fable' ? TIMELINE_ACCENTS.fable[resolvedTheme] : accent;
                    return (
                      <div
                        key={bar.id}
                        className={`${styles.stackBar} ${styles.windowLive}`}
                        style={{ '--provider-accent': barAccent } as CSSProperties}
                      >
                        {bar.remaining !== null && (
                          <span
                            className={styles.windowFill}
                            style={{
                              // A stacked pool's window can span far longer than the
                              // zoomed-in view (Cursor's 30-day billing cycle inside a
                              // 22-day "weekly" span). Anchoring the fill to the pool's
                              // absolute calendar position pushed it entirely off the
                              // left edge whenever usage happened early in a long cycle,
                              // leaving the bar solid gray with no visible fill at all.
                              // Fill the visible bar by the actual used share instead.
                              width: `${Math.min(100, Math.max(0, 100 - bar.remaining))}%`,
                            }}
                          />
                        )}
                        <span className={styles.inBarLabel} data-swap={usedPastHalf ? 1 : 0}>
                          {usedPastHalf ? (
                            <>
                              <b>{pct}</b> {bar.label}
                            </>
                          ) : (
                            <>
                              {bar.label} <b>{pct}</b>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <div
                key={window.startMs}
                className={`${styles.window} ${styles[`window${capitalize(window.state)}`]}`}
                data-window-state={window.state}
                data-clipped-start={window.startMs < span.startMs ? 1 : 0}
                data-clipped-end={window.endMs > span.endMs ? 1 : 0}
                data-window-start-ms={window.startMs}
                data-window-end-ms={window.endMs}
                style={{ left: `${window.leftPercent}%`, width: `${window.widthPercent}%` }}
                title={`${lane.displayName}\n${formatDay(window.startMs)} ${formatTime(
                  window.startMs
                )} → ${formatDay(window.endMs)} ${formatTime(window.endMs)}${
                  window.remaining !== null ? `\n${window.remaining}% remaining` : ''
                }`}
              >
                {/* Only the API-reported current window has meaningful usage;
                    projected windows intentionally have no fill. */}
                {window.remaining !== null && (
                  <span
                    className={styles.windowFill}
                    style={{
                      width: `${visibleUsedPercent(window, window.remaining, span.startMs, span.endMs)}%`,
                    }}
                  />
                )}
                {showLabel && (
                  <span className={styles.windowLabel}>
                    {window.remaining !== null ? `${window.remaining}% · ` : ''}
                    {endText}
                  </span>
                )}
              </div>
            );
          })
        )}

        {resetCredits.map((credit, index) => {
          const grantedLabel = t('quota_management.windows_credit_granted', {
            defaultValue: 'Granted',
          });
          const expiresLabel = t('quota_management.windows_credit_expires', {
            defaultValue: 'Expires',
          });
          const title = [
            t('quota_management.windows_reset_credit', { defaultValue: 'Manual reset' }),
            credit.grantedAtMs !== null
              ? `${grantedLabel}: ${formatDay(credit.grantedAtMs)} ${formatTime(credit.grantedAtMs)}`
              : null,
            `${expiresLabel}: ${formatDay(credit.expiresAtMs)} ${formatTime(credit.expiresAtMs)}`,
            formatRelativeInstant(credit.expiresAtMs, now, i18n.resolvedLanguage),
          ]
            .filter((line): line is string => line !== null)
            .join('\n');

          return (
            <span
              key={credit.id || `${credit.expiresAtMs}-${index}`}
              className={styles.resetCreditTick}
              style={{ left: `${credit.leftPercent}%` }}
              title={title}
              role="img"
              aria-label={title.split('\n').join(', ')}
            >
              <span
                className={styles.resetCreditLabel}
                data-align-end={credit.leftPercent > 75 ? 1 : 0}
              >
                {t('quota_management.windows_credit_expiry_short', {
                  defaultValue: 'Credit expires {{date}}',
                  date: formatDay(credit.expiresAtMs),
                })}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
