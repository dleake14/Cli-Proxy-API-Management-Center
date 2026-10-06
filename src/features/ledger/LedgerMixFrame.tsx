import { useTranslation } from 'react-i18next';
import styles from '@/pages/LedgerPage.module.scss';

export function LedgerMixFrame() {
  const { t } = useTranslation();
  // Keep the current LAN or Tailscale hostname. Loopback belongs to the viewer's device.
  const url = new URL(window.location.href);
  url.port = '47193';
  url.pathname = '/mix.html';
  url.search = '';
  url.hash = '';
  const frameUrl = new URL(url.href);
  frameUrl.port = '5173';

  return (
    <section className={styles.originalMix}>
      <p className={styles.meta}>
        <a href={url.href} target="_blank" rel="noopener noreferrer">
          {t('ledger.openMix')}
        </a>
        {' | '}
        {t('ledger.mixConnection')}
      </p>
      <iframe className={styles.mixFrame} src={frameUrl.href} title={t('ledger.originalMix')} />
    </section>
  );
}
