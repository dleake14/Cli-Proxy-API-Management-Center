import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TokenHistoryPage.module.scss';

const TOKEN_HISTORY_PATH = '/token-history.html';
const PROBE_TIMEOUT_MS = 20_000;
const RETRY_MS = 10_000;
const MARKER = 'name="token-history"';

// The bundled management API on 8317 has no Usage routes. Its CPAMC bridge on 5173 does.
function pageUrl(): string {
  const url = new URL(TOKEN_HISTORY_PATH, window.location.href);
  if (window.location.port === '8317') url.port = '5173';
  return url.href;
}

async function probe(url: string, signal: AbortSignal): Promise<boolean> {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) return false;
  return (await res.text()).includes(MARKER);
}

export function TokenHistoryPage() {
  const { t } = useTranslation();
  const [src] = useState(pageUrl);
  const [ready, setReady] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let request: AbortController | undefined;
    const check = async () => {
      request = new AbortController();
      const current = request;
      const timeout = window.setTimeout(() => current.abort(), PROBE_TIMEOUT_MS);
      let ok: boolean;
      try {
        ok = await probe(src, current.signal);
      } catch {
        ok = false;
      } finally {
        window.clearTimeout(timeout);
      }
      if (cancelled) return;
      if (ok) {
        setReady(true);
        return;
      }
      setRetrying(true);
      timer = window.setTimeout(check, RETRY_MS);
    };
    void check();
    return () => {
      cancelled = true;
      request?.abort();
      window.clearTimeout(timer);
    };
  }, [src]);

  return (
    <div className={styles.page}>
      {ready ? (
        <iframe className={styles.frame} src={src} title="Token history" />
      ) : (
        <div className={styles.fallback} role="status">
          {t(retrying ? 'token_history.unavailable' : 'token_history.loading')}
        </div>
      )}
    </div>
  );
}
