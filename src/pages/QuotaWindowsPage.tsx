import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveUsageSidecarUrl } from '@/utils/quota/sidecarUrl';
import { quotaRefreshIntervalMs } from '@/features/quota/quotaRefreshClock';
import styles from './QuotaWindowsPage.module.scss';

const QUOTA_WINDOWS_PATH = '/quota-windows';
// A cold ledger render can take several seconds. Allow the bridge's full build budget.
const LOAD_TIMEOUT_MS = 35_000;
const RETRY_MS = 5_000;

function pageUrls(): string[] {
  const bridge = new URL(QUOTA_WINDOWS_PATH, window.location.href);
  bridge.port = '5173';
  const local = new URL(QUOTA_WINDOWS_PATH, window.location.href).href;
  // The bundled management API on 8317 has no Usage routes. Its CPAMC bridge does.
  return [
    ...new Set([
      ...(window.location.port === '8317' ? [bridge.href] : [local, bridge.href]),
      resolveUsageSidecarUrl(QUOTA_WINDOWS_PATH),
    ]),
  ];
}

async function loadPage(url: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) return null;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  // Vite's SPA fallback is also HTML: it must never count as the quota page.
  if (doc.title !== 'Quota Windows' || !doc.querySelector('#r4') || !doc.querySelector('#r5')) {
    return null;
  }
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const mixUrl = new URL(window.location.href);
  mixUrl.port = '6680';
  mixUrl.pathname = '/';
  mixUrl.search = '';
  mixUrl.hash = '';
  const mixLink = doc.createElement('a');
  mixLink.href = mixUrl.href;
  mixLink.target = 'usage-live-mix';
  mixLink.textContent = 'Usage Mix';
  mixLink.rel = 'noopener';
  mixLink.className = 'usage-mix-button';
  mixLink.style.cssText =
    'display:inline-flex;align-items:center;justify-content:center;min-height:48px;' +
    'padding:8px 24px;margin:0 0 12px;border-radius:10px;background:#2563eb;' +
    'color:#fff;font-size:18px;font-weight:700;text-decoration:none;box-sizing:border-box';
  doc.querySelector('h1')?.before(mixLink);
  // Render the response already obtained. No second navigation or second cold build.
  // The base keeps live polling on the same endpoint, including from the bundled UI.
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

export function QuotaWindowsPage() {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string>();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const controllers = new Set<AbortController>();
    let checking = false;
    let ready = false;
    let lastLoadedAt = 0;
    const check = async () => {
      if (cancelled || checking || ready) return;
      window.clearTimeout(timer);
      checking = true;
      try {
        // Start fallbacks while a slow source is still pending. A filtered port
        // must not hold a healthy source behind a full request timeout.
        await Promise.all(
          pageUrls().map(async (url, index) => {
            if (index > 0) await new Promise((resolve) => window.setTimeout(resolve, 2000));
            if (cancelled || ready) return;
            const request = new AbortController();
            controllers.add(request);
            const timeout = window.setTimeout(() => request.abort(), LOAD_TIMEOUT_MS);
            try {
              const content = await loadPage(url, request.signal);
              if (cancelled || ready) return;
              if (content) {
                ready = true;
                lastLoadedAt = Date.now();
                setHtml(content);
                controllers.forEach((pending) => pending.abort());
              }
            } catch {
              // Other sources can still succeed. Retry after all sources fail.
            } finally {
              window.clearTimeout(timeout);
              controllers.delete(request);
            }
          })
        );
        if (!cancelled && !ready) setRetrying(true);
      } finally {
        checking = false;
        if (!cancelled && !ready) timer = window.setTimeout(check, RETRY_MS);
      }
    };
    const resume = () => {
      if (Date.now() - lastLoadedAt >= quotaRefreshIntervalMs()) ready = false;
      void check();
    };
    const refreshTimer = window.setInterval(() => {
      resume();
    }, 15_000);
    void check();
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      controllers.forEach((pending) => pending.abort());
      window.clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
    };
  }, []);

  return (
    <div className={styles.page}>
      {html ? (
        <iframe className={styles.frame} srcDoc={html} title="Quota windows" />
      ) : (
        <div className={styles.fallback} role="status">
          {t(retrying ? 'quota_windows.reconnecting' : 'quota_windows.loading')}
        </div>
      )}
    </div>
  );
}
