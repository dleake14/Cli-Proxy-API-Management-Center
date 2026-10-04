/** Keep every provider fresh across route changes, outages, and browser sleep. */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import { getStatusFromError } from '@/utils/quota';
import { classifyQuotaFiles } from './logic';
import { useQuotaBatchLoader } from './hooks/useQuotaBatchLoader';
import { getQuotaMap, getQuotaSetter, QUOTA_ADAPTERS } from './providers';
import { pickRefreshDelayMs } from './quotaRefreshClock';

const HEALTH_INTERVAL_MS = 60_000;
const RETRY_MS = 60_000;

// Keep the existing export so the authenticated shell remains the owner.
export function ClaudeQuotaMonitor() {
  const { t } = useTranslation();
  const { loadQuota: loadClaude } = useQuotaBatchLoader();
  const { loadQuota: loadOther } = useQuotaBatchLoader();
  const current = useRef({ t, loadClaude, loadOther });
  useEffect(() => {
    current.current = { t, loadClaude, loadOther };
  }, [t, loadClaude, loadOther]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let nextHealthAt = 0;
    let lastClock = Date.now();
    let nextClaudeAt = 0;
    let nextOtherAt = 0;
    let lastEntries: ReturnType<typeof classifyQuotaFiles> = [];

    const refreshGroup = async (entries: typeof lastEntries, claude: boolean) => {
      if (!entries.length) return;
      const accepted = await (claude ? current.current.loadClaude : current.current.loadOther)(
        entries,
        true
      );
      if (!accepted || disposed) return;
      const failed = entries.some(
        ({ type, file }) => getQuotaMap(QUOTA_ADAPTERS[type])[file.name]?.status !== 'success'
      );
      const rateLimited = entries.some(
        ({ type, file }) => getQuotaMap(QUOTA_ADAPTERS[type])[file.name]?.errorStatus === 429
      );
      // A provider throttle needs a cooldown, rather than a request every minute.
      const delay = rateLimited
        ? 15 * 60_000
        : failed
          ? RETRY_MS
          : claude
            ? pickRefreshDelayMs(Math.random, 10 * 60_000, 15 * 60_000)
            : pickRefreshDelayMs(Math.random);
      if (claude) nextClaudeAt = Date.now() + delay;
      else nextOtherAt = Date.now() + delay;
    };

    const check = async () => {
      const now = Date.now();
      if (now < lastClock) {
        nextHealthAt = 0;
        nextClaudeAt = 0;
        nextOtherAt = 0;
      }
      lastClock = now;
      if (disposed || inFlight || now < nextHealthAt) return;
      inFlight = true;
      try {
        // Always attempt this health check, including while disconnected.
        const response = await authFilesApi.list();
        if (disposed) return;
        useAuthStore.setState({ connectionStatus: 'connected' });
        const entries = classifyQuotaFiles(response?.files || []);
        const oldNames = new Set(lastEntries.map(({ file }) => file.name));
        if (entries.some(({ file }) => !oldNames.has(file.name))) {
          nextClaudeAt = 0;
          nextOtherAt = 0;
        }
        lastEntries = entries;
        await Promise.all([
          Date.now() >= nextClaudeAt
            ? refreshGroup(
                entries.filter((entry) => entry.type === 'claude'),
                true
              )
            : undefined,
          Date.now() >= nextOtherAt
            ? refreshGroup(
                entries.filter((entry) => entry.type !== 'claude'),
                false
              )
            : undefined,
        ]);
      } catch (error: unknown) {
        if (disposed) return;
        useAuthStore.setState({ connectionStatus: 'error' });
        nextClaudeAt = 0;
        nextOtherAt = 0;
        const message =
          error instanceof Error ? error.message : current.current.t('notification.refresh_failed');
        const status = getStatusFromError(error);
        for (const { type, file } of lastEntries) {
          const adapter = QUOTA_ADAPTERS[type];
          getQuotaSetter(adapter)((previous) => ({
            ...previous,
            [file.name]: adapter.buildErrorState(message, status),
          }));
        }
      } finally {
        inFlight = false;
        nextHealthAt = Date.now() + HEALTH_INTERVAL_MS;
      }
    };

    const catchUp = () => {
      void check();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') catchUp();
    };
    const timer = window.setInterval(catchUp, 15_000);
    catchUp();
    window.addEventListener('focus', catchUp);
    window.addEventListener('online', catchUp);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('online', catchUp);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
