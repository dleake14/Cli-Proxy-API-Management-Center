import { useEffect, useState } from 'react';
import styles from './QuotaWindowsPage.module.scss';

const QUOTA_WINDOWS_PORT = 47193;
const QUOTA_WINDOWS_PATH = '/quota-windows';
const PROBE_TIMEOUT_MS = 4000;
const LOAD_TIMEOUT_MS = 12000;

/** Same-origin path (Vite proxies it in dev) or the Usage server's own port. */
function portUrl(): string {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${QUOTA_WINDOWS_PORT}${QUOTA_WINDOWS_PATH}`;
}

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    return type.includes('text/html');
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

type FrameState = { status: 'probing' } | { status: 'ready'; src: string } | { status: 'failed'; tried: string[] };

export function QuotaWindowsPage() {
  const [state, setState] = useState<FrameState>({ status: 'probing' });
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const candidates = [QUOTA_WINDOWS_PATH, portUrl()];
      for (const url of candidates) {
        if (await probe(url)) {
          if (!cancelled) setState({ status: 'ready', src: url });
          return;
        }
      }
      if (!cancelled) setState({ status: 'failed', tried: candidates });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || loaded) return;
    const timer = window.setTimeout(() => setSlow(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state, loaded]);

  if (state.status === 'probing') {
    return <div className={styles.page} />;
  }

  if (state.status === 'failed') {
    return (
      <div className={styles.page}>
        <div className={styles.fallback} role="status">
          Quota windows page is unreachable. Tried: {state.tried.join(' , ')}. If this device
          runs a DNS filter or VPN, open {portUrl()} directly to see whether the page itself
          loads.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {slow && !loaded ? (
        <div className={styles.fallback} role="status">
          Still loading {state.src} after {LOAD_TIMEOUT_MS / 1000}s. The frame may be blocked
          on this device.
        </div>
      ) : null}
      <iframe
        className={styles.frame}
        src={state.src}
        title="Quota windows"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
