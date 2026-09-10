/**
 * Cursor Ultra quota. React-free.
 *
 * Reads the local Usage Ledger sidecar, which uses the IDE session token in
 * Cursor's state.vscdb. No key in this bundle.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, CursorQuotaRow, CursorQuotaState } from '@/types';
import { CURSOR_USAGE_ENDPOINT } from '@/utils/quota/constants';
import { isCursorFile, isDisabledAuthFile } from '@/utils/quota/validators';
import { isCursorTimelineRow } from '../../windowVisibility';
import type { QuotaProviderData } from '../types';

export interface CursorUsageWindow {
  id?: string;
  label?: string;
  used?: number | string | null;
  limit?: number | string | null;
  reset_at_ms?: number | string | null;
  period_hours?: number | string | null;
}

export interface CursorUsagePayload {
  ok?: boolean;
  windows?: CursorUsageWindow[];
  stale?: boolean;
  source?: string;
  fetched_at?: string;
  error?: string;
  plan?: string;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function buildCursorQuotaRows(payload: CursorUsagePayload | null): CursorQuotaRow[] {
  const windows = Array.isArray(payload?.windows) ? payload.windows : [];
  const rows: CursorQuotaRow[] = [];

  for (const [index, win] of windows.entries()) {
    const id = String(win.id || `window-${index}`);
    if (!isCursorTimelineRow(id)) continue;
    const used = toNumber(win.used);
    if (used === null) continue;
    rows.push({
      id,
      label: win.label || id,
      used: Math.max(0, Math.min(100, used)),
      limit: 100,
      resetAtMs: toNumber(win.reset_at_ms),
      periodHours: toNumber(win.period_hours),
    });
  }
  return rows;
}

export async function requestCursorUsage(
  endpoint: string = CURSOR_USAGE_ENDPOINT,
  fetchImpl: typeof fetch = fetch
): Promise<CursorUsagePayload> {
  const response = await fetchImpl(endpoint, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as CursorUsagePayload;
  if (!payload || payload.ok === false) {
    throw new Error(payload?.error || 'empty_data');
  }
  return payload;
}

const fetchCursorQuota = async (file: AuthFileItem, t: TFunction): Promise<CursorQuotaRow[]> => {
  void file;
  let payload: CursorUsagePayload | null = null;
  let failure: Error | null = null;
  try {
    payload = await requestCursorUsage();
  } catch (err: unknown) {
    failure = err instanceof Error ? err : new Error(String(err));
  }
  if (failure) {
    throw new Error(
      failure.message.startsWith('HTTP') ? failure.message : t('cursor_quota.unreachable')
    );
  }
  const rows = buildCursorQuotaRows(payload);
  if (rows.length === 0) {
    throw new Error(t('cursor_quota.empty_data'));
  }
  return rows;
};

export const CURSOR_CONFIG: QuotaProviderData<CursorQuotaState, CursorQuotaRow[]> = {
  type: 'cursor',
  i18nPrefix: 'cursor_quota',
  filterFn: (file) => isCursorFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCursorQuota,
  storeSelector: (state) => state.cursorQuota,
  storeSetter: 'setCursorQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
};
