import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

type Event = {
  provider: string;
  window: string;
  at: string | null;
  central: string | null;
  periodHours: number | null;
  source: 'live' | 'derived';
};

type UsageWindow = {
  limit_window_seconds?: number;
  reset_at?: number;
};
type CodexUsage = {
  rate_limit?: { primary_window?: UsageWindow };
  additional_rate_limits?: Array<{
    rate_limit?: { primary_window?: UsageWindow; secondary_window?: UsageWindow };
  }>;
};
type CreditPayload = { credits?: Array<{ expires_at?: string }> };
type ClaudeUsage = Record<string, { resets_at?: string }>;
type XaiBilling = {
  config?: { currentPeriod?: { type?: string; end?: string } };
};
type SidecarPayload = {
  windows?: Array<{ id?: string; reset_at_ms?: number; period_hours?: number }>;
};

const AUTH_DIR = join(homedir(), '.cli-proxy-api');
const CENTRAL = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  weekday: 'short',
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const central = (value: string | number | null): string | null => {
  if (value === null) return null;
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return Number.isFinite(date.getTime()) ? CENTRAL.format(date) : null;
};

async function activeAuth(prefix: string): Promise<Record<string, unknown> | null> {
  const names = (await readdir(AUTH_DIR)).filter(
    (name) => name.startsWith(`${prefix}-`) && name.endsWith('.json')
  );
  for (const name of names) {
    const data = await Bun.file(join(AUTH_DIR, name)).json();
    if (data.disabled !== true && typeof data.access_token === 'string') return data;
  }
  return null;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

const events: Event[] = [];
const errors: string[] = [];

async function auditCodex() {
  const auth = await activeAuth('codex');
  if (!auth) throw new Error('no active Codex credential');
  const headers: Record<string, string> = {
    Authorization: ['Bearer', auth.access_token].join(' '),
    Accept: 'application/json',
    'OpenAI-Beta': 'codex-1',
    Originator: 'Codex Desktop',
  };
  if (typeof auth.account_id === 'string') headers['Chatgpt-Account-Id'] = auth.account_id;
  const usage = await getJson<CodexUsage>('https://chatgpt.com/backend-api/wham/usage', headers);
  const add = (window: UsageWindow | undefined, label: string) => {
    if (!window) return;
    const seconds = Number(window.limit_window_seconds);
    const resetAt = Number(window.reset_at);
    events.push({
      provider: 'Codex',
      window: label,
      at: Number.isFinite(resetAt) ? new Date(resetAt * 1000).toISOString() : null,
      central: Number.isFinite(resetAt) ? central(resetAt) : null,
      periodHours: Number.isFinite(seconds) ? seconds / 3600 : null,
      source: 'live',
    });
  };
  add(usage.rate_limit?.primary_window, 'main');
  for (const [index, limit] of (usage.additional_rate_limits ?? []).entries()) {
    add(limit.rate_limit?.primary_window, `additional-${index}-primary`);
    add(limit.rate_limit?.secondary_window, `additional-${index}-secondary`);
  }
  const credits = await getJson<CreditPayload>(
    'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits',
    headers
  );
  for (const credit of credits.credits ?? []) {
    events.push({
      provider: 'Codex',
      window: 'reset-credit-expiry',
      at: credit.expires_at ?? null,
      central: central(credit.expires_at ?? null),
      periodHours: null,
      source: 'live',
    });
  }
}

async function auditClaude() {
  const auth = await activeAuth('claude');
  if (!auth) throw new Error('no active Claude credential');
  const data = await getJson<ClaudeUsage>('https://api.anthropic.com/api/oauth/usage', {
    Authorization: ['Bearer', auth.access_token].join(' '),
    'anthropic-beta': 'oauth-2025-04-20',
  });
  for (const [name, window] of Object.entries(data)) {
    if (!window?.resets_at) continue;
    events.push({
      provider: 'Claude',
      window: name,
      at: window.resets_at,
      central: central(window.resets_at),
      periodHours: name === 'five_hour' ? 5 : name.startsWith('seven_day') ? 168 : null,
      source: 'live',
    });
  }
}

async function auditXai() {
  const auth = await activeAuth('xai');
  if (!auth) throw new Error('no active xAI credential');
  const data = await getJson<XaiBilling>('https://cli-chat-proxy.grok.com/v1/billing?format=credits', {
    Authorization: ['Bearer', auth.access_token].join(' '),
  });
  const period = data.config?.currentPeriod;
  events.push({
    provider: 'Grok',
    window: period?.type ?? 'unknown',
    at: period?.end ?? null,
    central: central(period?.end ?? null),
    periodHours: period?.type === 'USAGE_PERIOD_TYPE_WEEKLY' ? 168 : null,
    source: 'live',
  });
}

async function auditSidecar(provider: string, path: string) {
  const data = await getJson<SidecarPayload>(`http://127.0.0.1:47193/${path}`);
  for (const window of data.windows ?? []) {
    const resetAtMs = Number(window.reset_at_ms);
    events.push({
      provider,
      window: window.id ?? 'unknown',
      at: Number.isFinite(resetAtMs) && resetAtMs > 0 ? new Date(resetAtMs).toISOString() : null,
      central: Number.isFinite(resetAtMs) && resetAtMs > 0 ? central(resetAtMs / 1000) : null,
      periodHours: Number(window.period_hours) || null,
      source: 'live',
    });
  }
}

for (const [name, task] of [
  ['Codex', auditCodex],
  ['Claude', auditClaude],
  ['Grok', auditXai],
  ['Cursor', () => auditSidecar('Cursor', 'cursor-usage')],
  ['Muse', () => auditSidecar('Muse', 'muse-usage')],
] as const) {
  try {
    await task();
  } catch (error) {
    errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const mainCodex = events.find((event) => event.provider === 'Codex' && event.window === 'main');
const ok = Boolean(mainCodex?.at && mainCodex.periodHours === 168) && errors.length === 0;
console.log(JSON.stringify({ ok, generatedAt: new Date().toISOString(), timezone: 'America/Chicago', events, errors }, null, 2));
if (!ok) process.exitCode = 1;
