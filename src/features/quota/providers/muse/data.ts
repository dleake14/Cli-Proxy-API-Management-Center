/**
 * Muse High Usage remaining. React-free.
 *
 * The Usage sidecar fails closed: Meta does not publish remaining percent.
 * This adapter still exists so the card shows that error instead of a fake 0%.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, MuseQuotaRow, MuseQuotaState } from '@/types';
import { MUSE_USAGE_ENDPOINT } from '@/utils/quota/constants';
import { isDisabledAuthFile, isMuseFile } from '@/utils/quota/validators';
import { museWeeklyResetMs } from '../../museResetSchedule';
import type { QuotaProviderData } from '../types';

export interface MuseUsagePayload {
  ok?: boolean;
  windows?: Array<{
    id?: string;
    label?: string;
    used?: number | string | null;
    limit?: number | string | null;
    reset_at_ms?: number | string | null;
    period_hours?: number | string | null;
  }>;
  error?: string;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function buildMuseQuotaRows(payload: MuseUsagePayload | null): MuseQuotaRow[] {
  const windows = Array.isArray(payload?.windows) ? payload.windows : [];
  const rows: MuseQuotaRow[] = [];
  for (const [index, win] of windows.entries()) {
    const id = String(win.id || `window-${index}`);
    const used = toNumber(win.used);
    if (used === null) continue;
    const resetAtMs = toNumber(win.reset_at_ms);
    rows.push({
      id,
      label:
        id === 'weekly'
          ? 'High Usage'
          : win.label || id,
      used: Math.max(0, Math.min(100, used)),
      limit: 100,
      resetAtMs: id === 'weekly' ? museWeeklyResetMs() : resetAtMs,
      periodHours: id === 'weekly' ? 24 * 7 : toNumber(win.period_hours),
    });
  }
  return rows;
}

export async function requestMuseUsage(
  endpoint: string = MUSE_USAGE_ENDPOINT,
  fetchImpl: typeof fetch = fetch
): Promise<MuseUsagePayload> {
  const response = await fetchImpl(endpoint, { method: 'GET', headers: { Accept: 'application/json' } });
  const payload = (await response.json()) as MuseUsagePayload;
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

const fetchMuseQuota = async (file: AuthFileItem, t: TFunction): Promise<MuseQuotaRow[]> => {
  void file;
  let payload: MuseUsagePayload | null = null;
  let failure: Error | null = null;

  try {
    payload = await requestMuseUsage();
  } catch (err: unknown) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  if (failure) {
    throw new Error(failure.message || t('muse_quota.unavailable'));
  }

  const rows = buildMuseQuotaRows(payload);
  if (rows.length === 0) {
    throw new Error(t('muse_quota.unavailable'));
  }
  return rows;
};

export const MUSE_CONFIG: QuotaProviderData<MuseQuotaState, MuseQuotaRow[]> = {
  type: 'muse',
  i18nPrefix: 'muse_quota',
  filterFn: (file) => isMuseFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchMuseQuota,
  storeSelector: (state) => state.museQuota,
  storeSetter: 'setMuseQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
};
