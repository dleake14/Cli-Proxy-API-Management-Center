/**
 * Ollama 额度数据层。React-free / SCSS-free。
 *
 * 与其他提供商不同：Ollama 不是 CLIProxyAPI 的原生 OAuth 提供商，auth-dir 里没有
 * 凭证文件，后端 `/api-call` 也不会替它报额度。因此这一层从本机 Usage Ledger
 * 服务读取已经归一化的 Ollama Cloud 用量（该服务自己带 Bearer key 打
 * https://ollama.com/api/usage），面板里不出现任何密钥。
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, OllamaQuotaRow, OllamaQuotaState } from '@/types';
import { OLLAMA_USAGE_ENDPOINT } from '@/utils/quota/constants';
import { isDisabledAuthFile, isOllamaFile } from '@/utils/quota/validators';
import type { QuotaProviderData } from '../types';

/** 服务端下发的归一化窗口（used/limit 同为百分比，便于复用 kimi 的行渲染公式）。 */
export interface OllamaUsageWindow {
  id?: string;
  label?: string;
  used?: number | string | null;
  limit?: number | string | null;
  reset_at_ms?: number | string | null;
  period_hours?: number | string | null;
}

export interface OllamaUsagePayload {
  ok?: boolean;
  windows?: OllamaUsageWindow[];
  stale?: boolean;
  source?: string;
  fetched_at?: string;
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

const FALLBACK_LABELS: Record<string, string> = {
  session: 'Session',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * 把服务端窗口转成额度行。
 *
 * 缺 used 的窗口直接丢弃（渲染成 0% 会把「没数据」伪装成「满额」）。
 * limit 归一到 100，使 remaining 计算与其余提供商一致。
 */
export function buildOllamaQuotaRows(payload: OllamaUsagePayload | null): OllamaQuotaRow[] {
  const windows = Array.isArray(payload?.windows) ? payload.windows : [];
  const rows: OllamaQuotaRow[] = [];

  for (const [index, win] of windows.entries()) {
    const used = toNumber(win.used);
    if (used === null) continue;

    const id = String(win.id || `window-${index}`);
    const resetAtMs = toNumber(win.reset_at_ms);
    const periodHours = toNumber(win.period_hours);

    rows.push({
      id,
      label: win.label || FALLBACK_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1),
      used: Math.max(0, Math.min(100, used)),
      limit: 100,
      resetAtMs: resetAtMs === null ? null : resetAtMs,
      periodHours: periodHours === null ? null : periodHours,
    });
  }

  return rows;
}

/** 拉取 Ollama 用量。endpoint 不可达 / 非 JSON / ok:false 一律抛错给卡片 error 态。 */
export async function requestOllamaUsage(
  endpoint: string = OLLAMA_USAGE_ENDPOINT,
  fetchImpl: typeof fetch = fetch
): Promise<OllamaUsagePayload> {
  const response = await fetchImpl(endpoint, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as OllamaUsagePayload;
  if (!payload || payload.ok === false) {
    throw new Error(payload?.error || 'empty_data');
  }
  return payload;
}

const fetchOllamaQuota = async (file: AuthFileItem, t: TFunction): Promise<OllamaQuotaRow[]> => {
  void file;
  let payload: OllamaUsagePayload | null = null;
  let failure: Error | null = null;

  try {
    payload = await requestOllamaUsage();
  } catch (err: unknown) {
    failure = err instanceof Error ? err : new Error(String(err));
  }

  // Rethrown outside the catch so the transport status survives and the friendly
  // message is only substituted when the sidecar itself is unreachable.
  if (failure) {
    throw new Error(
      failure.message.startsWith('HTTP') ? failure.message : t('ollama_quota.unreachable')
    );
  }

  const rows = buildOllamaQuotaRows(payload);
  if (rows.length === 0) {
    throw new Error(t('ollama_quota.empty_data'));
  }
  return rows;
};

export const OLLAMA_CONFIG: QuotaProviderData<OllamaQuotaState, OllamaQuotaRow[]> = {
  type: 'ollama',
  i18nPrefix: 'ollama_quota',
  filterFn: (file) => isOllamaFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchOllamaQuota,
  storeSelector: (state) => state.ollamaQuota,
  storeSetter: 'setOllamaQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
};
