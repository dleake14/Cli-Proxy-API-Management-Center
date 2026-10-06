export interface LedgerModel {
  model: string;
  source: string;
  tokens: number | null;
  turns: number;
  cost: number | null;
  cost_per_turn: number | null;
  cache_hit_rate: number | null;
}
export interface LedgerDay {
  day: string;
  tokens: number | null;
  turns: number;
  estimated_cost: number | null;
  is_partial: boolean;
  models: LedgerModel[];
}
export interface LedgerHistory {
  generated_at: string;
  latest_generated: string | null;
  timezone: string;
  days: LedgerDay[];
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid ledger response');
  return v as Record<string, unknown>;
};
const number = (v: unknown, nullable = false): number | null => {
  if (v === null && nullable) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
    throw new Error('Invalid ledger metric');
  return v;
};
export function parseHistory(value: unknown): LedgerHistory {
  const raw = object(value);
  if (
    typeof raw.generated_at !== 'string' ||
    !Number.isFinite(Date.parse(raw.generated_at)) ||
    !Array.isArray(raw.days)
  )
    throw new Error('Invalid ledger history');
  const days = raw.days
    .map((v): LedgerDay => {
      const d = object(v);
      if (
        typeof d.day !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(d.day) ||
        !Number.isFinite(Date.parse(d.day)) ||
        new Date(d.day).toISOString().slice(0, 10) !== d.day ||
        !Array.isArray(d.models) ||
        typeof d.is_partial !== 'boolean'
      )
        throw new Error('Invalid ledger day');
      return {
        day: d.day,
        tokens: number(d.tokens, true),
        turns: number(d.turns)!,
        estimated_cost: number(d.estimated_cost, true),
        is_partial: d.is_partial,
        models: d.models.map((v): LedgerModel => {
          const m = object(v);
          if (typeof m.model !== 'string' || typeof m.source !== 'string')
            throw new Error('Invalid ledger model');
          return {
            model: m.model,
            source: m.source,
            tokens: number(m.tokens, true),
            turns: number(m.turns)!,
            cost: number(m.cost, true),
            cost_per_turn: number(m.cost_per_turn, true),
            cache_hit_rate: number(m.cache_hit_rate, true),
          };
        }),
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
  return {
    generated_at: raw.generated_at,
    latest_generated: typeof raw.latest_generated === 'string' ? raw.latest_generated : null,
    timezone: 'America/Chicago',
    days,
  };
}
export const defaultDay = (days: LedgerDay[]) =>
  days.find((d) => d.is_partial)?.day ?? days[0]?.day ?? '';
export const previousDay = (days: LedgerDay[]) => days.find((d) => !d.is_partial)?.day ?? '';
export function modelShares(day: LedgerDay, metric: 'tokens' | 'turns') {
  const total = day.models.reduce((sum, m) => sum + (m[metric] ?? 0), 0);
  return day.models
    .map((m) => ({ ...m, share: total > 0 ? (m[metric] ?? 0) / total : 0 }))
    .sort((a, b) => b.share - a.share || b.turns - a.turns);
}
export async function fetchHistory(signal?: AbortSignal): Promise<LedgerHistory> {
  // The CPAMC service exposes only aggregate telemetry, never the raw snapshot.
  const url = `${window.location.protocol}//${window.location.hostname}:5173/ledger-history`;
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(12000)]),
  });
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
    throw new Error('Ledger unavailable');
  return parseHistory(await res.json());
}
