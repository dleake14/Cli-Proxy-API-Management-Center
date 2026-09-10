/** Shared quota-window visibility rules for cards and the reset timeline. */

export function isHiddenCodexWindow(parts: {
  id?: string;
  label?: string;
  labelParams?: Record<string, unknown>;
}): boolean {
  const searchableText = [parts.id, parts.label, ...Object.values(parts.labelParams ?? {})]
    .join(' ')
    .toLowerCase();
  return searchableText.includes('spark');
}

/** Cursor Ultra exposes two independent pools; the billing total is not a window. */
export const CURSOR_TIMELINE_ROW_IDS = new Set(['session', 'weekly']);

export function isCursorTimelineRow(id: string | undefined): boolean {
  return CURSOR_TIMELINE_ROW_IDS.has(String(id ?? ''));
}

/** Claude weekly timeline stacks Fable over the all-models allowance only. */
export const CLAUDE_STACKED_WINDOW_IDS = new Set(['seven-day-fable', 'seven-day']);

export function isClaudeStackedWindow(id: string | undefined): boolean {
  return CLAUDE_STACKED_WINDOW_IDS.has(String(id ?? ''));
}

/** Muse timeline tracks the weekly High Usage meter only. */
export const MUSE_TIMELINE_ROW_IDS = new Set(['weekly']);

export function isMuseTimelineRow(id: string | undefined): boolean {
  return MUSE_TIMELINE_ROW_IDS.has(String(id ?? ''));
}
