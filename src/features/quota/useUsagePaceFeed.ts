/**
 * One shared poller for the Usage quota feed (`/quota-windows-data`).
 *
 * The pace strip and the timeline markers read the same feed. A single timer
 * starts with the first subscriber and stops with the last, like the shared
 * clock. A failed poll keeps the last good feed (its read times show its age)
 * and flags the error; it never invents a reading.
 */

import { useSyncExternalStore } from 'react';
import { resolveUsageSidecarUrl } from '@/utils/quota/sidecarUrl';
import { quotaRefreshIntervalMs } from './quotaRefreshClock';
import { isUsageFeed, type UsageFeed } from './usagePace';

const FEED_PATH = '/quota-windows-data';
const RETRY_MS = 60_000;
const FETCH_TIMEOUT_MS = 35_000;

export interface UsagePaceFeedState {
  feed: UsageFeed | null;
  fetchedAtMs: number | null;
  error: boolean;
}

let state: UsagePaceFeedState = { feed: null, fetchedAtMs: null, error: false };
const listeners = new Set<() => void>();
let timer: number | undefined;
let inFlight = false;

/** Same source order as the /windows route: local bridge, 5173 bridge, then the sidecar. */
function feedUrls(): string[] {
  const bridge = new URL(FEED_PATH, window.location.href);
  bridge.port = '5173';
  const local = new URL(FEED_PATH, window.location.href).href;
  // The bundled management API on 8317 has no Usage routes.
  return [
    ...new Set([
      ...(window.location.port === '8317' ? [bridge.href] : [local, bridge.href]),
      resolveUsageSidecarUrl(FEED_PATH),
    ]),
  ];
}

async function fetchFeed(url: string): Promise<UsageFeed | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
    const body: unknown = await res.json();
    return isUsageFeed(body) ? body : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function publish(next: UsagePaceFeedState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function poll() {
  if (inFlight) return;
  inFlight = true;
  let ok = false;
  try {
    for (const url of feedUrls()) {
      const feed = await fetchFeed(url);
      if (feed) {
        publish({ feed, fetchedAtMs: Date.now(), error: false });
        ok = true;
        break;
      }
    }
    if (!ok && !state.error) publish({ ...state, error: true });
  } finally {
    inFlight = false;
    if (listeners.size > 0) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), ok ? quotaRefreshIntervalMs() : RETRY_MS);
    }
  }
}

const onFocus = () => {
  const age = state.fetchedAtMs === null ? Infinity : Date.now() - state.fetchedAtMs;
  if (age > RETRY_MS) void poll();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('focus', onFocus);
    void poll();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    }
  };
}

const getSnapshot = () => state;

export function useUsagePaceFeed(): UsagePaceFeedState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
