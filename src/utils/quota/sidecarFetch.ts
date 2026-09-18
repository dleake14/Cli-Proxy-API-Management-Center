/** Timeout and freshness guards shared by local Usage quota sidecars. */

export const SIDECAR_FETCH_TIMEOUT_MS = 12_000;
export const SIDECAR_STALE_AFTER_MS = 10 * 60_000;

export class SidecarTimeoutError extends Error {
  constructor() {
    super('sidecar_timeout');
    this.name = 'SidecarTimeoutError';
  }
}

export class SidecarStaleError extends Error {
  constructor() {
    super('sidecar_stale');
    this.name = 'SidecarStaleError';
  }
}

type SidecarWindow = { stale?: boolean };

export type SidecarFreshnessPayload = {
  stale?: boolean;
  fetched_at?: string;
  windows?: SidecarWindow[];
};

type SidecarJsonResult = { response: Response; payload: unknown };
const inFlightSidecarJson = new Map<string, Promise<SidecarJsonResult>>();

const isAbortFailure = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error as { name?: unknown }).name === 'AbortError';

export async function fetchSidecarResponse(
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SIDECAR_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (controller.signal.aborted && isAbortFailure(error)) throw new SidecarTimeoutError();
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/**
 * Keep the deadline in force until the JSON body has been consumed too.
 * Fetch resolves as soon as headers arrive; clearing a timer there would leave
 * a stalled response body able to hold the quota batch loader forever.
 */
async function performSidecarJsonFetch<T>(
  endpoint: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = (await response.json()) as T;
    return { response, payload };
  } catch (error: unknown) {
    if (controller.signal.aborted && isAbortFailure(error)) throw new SidecarTimeoutError();
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function fetchSidecarJson<T>(
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SIDECAR_FETCH_TIMEOUT_MS
): Promise<{ response: Response; payload: T }> {
  const existing = inFlightSidecarJson.get(endpoint);
  if (existing) {
    return existing as Promise<{ response: Response; payload: T }>;
  }
  const request = performSidecarJsonFetch<T>(endpoint, fetchImpl, timeoutMs);
  inFlightSidecarJson.set(endpoint, request as Promise<SidecarJsonResult>);
  request.then(
    () => {
      if (inFlightSidecarJson.get(endpoint) === request) inFlightSidecarJson.delete(endpoint);
    },
    () => {
      if (inFlightSidecarJson.get(endpoint) === request) inFlightSidecarJson.delete(endpoint);
    }
  );
  return request;
}

/** Missing freshness metadata stays unknown, never guessed as stale. */
export function isSidecarPayloadStale(
  payload: SidecarFreshnessPayload | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!payload) return false;
  if (payload.stale || payload.windows?.some((window) => window?.stale)) return true;
  if (!payload.fetched_at) return false;
  const fetchedAt = Date.parse(payload.fetched_at);
  return Number.isFinite(fetchedAt) && nowMs - fetchedAt > SIDECAR_STALE_AFTER_MS;
}
