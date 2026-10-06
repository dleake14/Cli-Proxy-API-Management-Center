import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  defaultDay,
  previousDay,
  fetchHistory,
  modelShares,
  type LedgerHistory,
  type LedgerModel,
} from '@/features/ledger/data';
import { modelColor } from '@/features/ledger/modelColors';
import { LedgerMixFrame } from '@/features/ledger/LedgerMixFrame';
import styles from './LedgerPage.module.scss';

const count = (n: number | null) => (n === null ? '—' : n.toLocaleString());
const money = (n: number | null) =>
  n === null
    ? '—'
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const accent = (m: LedgerModel) => modelColor(m.model);

export function LedgerPage() {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [originalMix, setOriginalMix] = useState(
    () => new URLSearchParams(window.location.hash.split('?')[1]).get('view') === 'mix'
  );
  useEffect(() => {
    // The layout retains route locations during transitions, including query-only changes.
    const syncView = () =>
      setOriginalMix(new URLSearchParams(window.location.hash.split('?')[1]).get('view') === 'mix');
    window.addEventListener('hashchange', syncView);
    return () => window.removeEventListener('hashchange', syncView);
  }, []);
  const selectView = (mix: boolean) => {
    setOriginalMix(mix);
    setSearchParams(mix ? { view: 'mix' } : {});
  };
  const [history, setHistory] = useState<LedgerHistory | null>(null);
  const [selected, setSelected] = useState('');
  const [metric, setMetric] = useState<'tokens' | 'turns'>('tokens');
  const [cardMetric, setCardMetric] = useState<'tokens' | 'turns' | 'cost'>('tokens');
  const cardFormat = (value: number | null) =>
    cardMetric === 'cost' ? money(value) : count(value);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const next = await fetchHistory(signal);
      if (signal?.aborted) return;
      setHistory(next);
      setSelected((old) => (next.days.some((d) => d.day === old) ? old : defaultDay(next.days)));
      setError(false);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setCheckedAt(Date.now());
      }
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), 60000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refresh]);
  const days = history?.days ?? [];
  const day = days.find((d) => d.day === selected);
  const mix = day ? modelShares(day, metric) : [];
  const index = days.findIndex((d) => d.day === selected);
  const stale = history && checkedAt - Date.parse(history.generated_at) > 20 * 60000;
  const modelTable = (models: LedgerModel[]) => (
    <div className={styles.scroll}>
      <table>
        <thead>
          <tr>
            {['model', 'turns', 'tokens', 'perTurn', 'cache', 'cost'].map((k) => (
              <th key={k}>{t(`ledger.${k}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...models]
            .sort((a, b) => b.turns - a.turns)
            .map((m, i) => (
              <tr key={`${m.source}-${m.model}-${i}`}>
                <td>
                  <span
                    className={styles.modelLabel}
                    data-model={m.model}
                    style={{ '--accent': accent(m) } as CSSProperties}
                  >
                    <span className={styles.dot} style={{ background: accent(m) }} />
                    {m.model}
                  </span>{' '}
                  <small>{m.source}</small>
                </td>
                <td>{count(m.turns)}</td>
                <td>{count(m.tokens)}</td>
                <td>{money(m.cost_per_turn)}</td>
                <td>
                  {m.cache_hit_rate === null ? '—' : `${(m.cache_hit_rate * 100).toFixed(1)}%`}
                </td>
                <td>{money(m.cost)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{t('ledger.title')}</h1>
          <p>{t('ledger.subtitle')}</p>
        </div>
        <div className={styles.controls} role="group" aria-label={t('ledger.view')}>
          <button onClick={() => selectView(false)} aria-pressed={!originalMix}>
            {t('ledger.dailyHistory')}
          </button>
          <button onClick={() => selectView(true)} aria-pressed={originalMix}>
            {t('ledger.originalMix')}
          </button>
          {!originalMix && (
            <button onClick={() => void refresh()} disabled={loading}>
              {t('ledger.refresh')}
            </button>
          )}
        </div>
      </header>
      {originalMix && <LedgerMixFrame />}
      {!originalMix && (
        <>
          {error && (
            <p role="alert" className={styles.warning}>
              {t('ledger.error')}
            </p>
          )}
          {stale && (
            <p role="status" className={styles.warning}>
              {t('ledger.stale')}
            </p>
          )}
          {history && (
            <p className={styles.meta}>
              {t('ledger.updated')}: {new Date(history.generated_at).toLocaleString()} |
              America/Chicago
            </p>
          )}
          {loading && !history && <p role="status">{t('ledger.loading')}</p>}
          {history && !days.length && <p role="status">{t('ledger.empty')}</p>}
          {day && (
            <>
              <div className={styles.controls}>
                <button
                  disabled={index >= days.length - 1}
                  onClick={() => setSelected(days[index + 1].day)}
                >
                  {t('ledger.older')}
                </button>
                <select
                  aria-label={t('ledger.day')}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {days.map((d) => (
                    <option key={d.day} value={d.day}>
                      {d.day}
                      {d.is_partial ? ` (${t('ledger.partial')})` : ''}
                    </option>
                  ))}
                </select>
                <button disabled={index <= 0} onClick={() => setSelected(days[index - 1].day)}>
                  {t('ledger.newer')}
                </button>
                <button onClick={() => setSelected(defaultDay(days))}>{t('ledger.today')}</button>
                <button
                  disabled={!previousDay(days)}
                  onClick={() => setSelected(previousDay(days))}
                >
                  {t('ledger.yesterday')}
                </button>
              </div>
              <div className={styles.metrics}>
                {[
                  [t('ledger.tokens'), count(day.tokens)],
                  [t('ledger.turns'), count(day.turns)],
                  [t('ledger.models'), count(day.models.length)],
                  [t('ledger.cost'), money(day.estimated_cost)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <section aria-label={t('ledger.recentDays')}>
                <div className={styles.header}>
                  <h2>{t('ledger.recentDays')}</h2>
                  <div
                    className={styles.controls}
                    role="group"
                    aria-label={t('ledger.cardMeasure')}
                  >
                    {(['tokens', 'turns', 'cost'] as const).map((k) => (
                      <button
                        key={k}
                        aria-pressed={cardMetric === k}
                        onClick={() => setCardMetric(k)}
                      >
                        {t(k === 'cost' ? 'ledger.cardDollars' : `ledger.${k}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.dayCards}>
                  {days.slice(0, 10).map((d) => (
                    <button
                      key={d.day}
                      className={styles.dayCard}
                      data-day={d.day}
                      aria-pressed={selected === d.day}
                      onClick={() => setSelected(d.day)}
                    >
                      <span className={styles.cardDate}>
                        {d.day}
                        {d.is_partial && <small>{t('ledger.today')}</small>}
                      </span>
                      <span className={styles.cardTokens}>
                        <strong>
                          {cardFormat(cardMetric === 'cost' ? d.estimated_cost : d[cardMetric])}
                        </strong>
                        <small>
                          {t(`ledger.${cardMetric}`)}
                          {d.is_partial ? ` (${t('ledger.partial')})` : ''}
                        </small>
                      </span>
                      <span className={styles.cardModelsTitle}>
                        {t(
                          cardMetric === 'turns'
                            ? 'ledger.topModels'
                            : cardMetric === 'cost'
                              ? 'ledger.topByCost'
                              : 'ledger.topByTokens'
                        )}
                      </span>
                      <span className={styles.cardModels}>
                        {[...d.models]
                          .sort(
                            (a, b) =>
                              (b[cardMetric] ?? -1) - (a[cardMetric] ?? -1) || b.turns - a.turns
                          )
                          .slice(0, 3)
                          .map((m, i) => (
                            <span key={i} className={styles.cardModel}>
                              <span className={styles.dot} style={{ background: accent(m) }} />
                              <span title={`${m.model} (${m.source})`}>{m.model}</span>
                              <small>{cardFormat(m[cardMetric])}</small>
                            </span>
                          ))}
                        {!d.models.length && <small>{t('ledger.noModels')}</small>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <div className={styles.header}>
                  <h2>{t('ledger.mix')}</h2>
                  <div className={styles.controls}>
                    {(['tokens', 'turns'] as const).map((k) => (
                      <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)}>
                        {t(`ledger.${k}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.mix} aria-label={t('ledger.mix')}>
                  {mix
                    .filter((m) => m.share > 0)
                    .map((m, i) => (
                      <div
                        key={i}
                        title={`${m.model}: ${(m.share * 100).toFixed(1)}%`}
                        style={{ width: `${m.share * 100}%`, background: accent(m) }}
                      />
                    ))}
                </div>
                <div className={styles.legend}>
                  {mix.map((m, i) => (
                    <span
                      key={i}
                      className={styles.legendItem}
                      style={{ '--accent': accent(m) } as CSSProperties}
                    >
                      <span className={styles.dot} style={{ background: accent(m) }} />
                      {m.model} {(m.share * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
                {modelTable(day.models)}
                {!day.models.length && <p>{t('ledger.noModels')}</p>}
              </section>
              <section>
                <h2>{t('ledger.history')}</h2>
                <div className={styles.scroll}>
                  <table>
                    <thead>
                      <tr>
                        {['day', 'tokens', 'turns', 'cost', 'topModels'].map((k) => (
                          <th key={k}>{t(`ledger.${k}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => (
                        <tr key={d.day} className={selected === d.day ? styles.selected : ''}>
                          <td>
                            <button onClick={() => setSelected(d.day)}>{d.day}</button>
                            {d.is_partial && <small> {t('ledger.partial')}</small>}
                          </td>
                          <td>{count(d.tokens)}</td>
                          <td>{count(d.turns)}</td>
                          <td>{money(d.estimated_cost)}</td>
                          <td>
                            <button
                              className={styles.topModels}
                              onClick={() => setExpanded(expanded === d.day ? null : d.day)}
                              aria-expanded={expanded === d.day}
                            >
                              {[...d.models]
                                .sort((a, b) => b.turns - a.turns)
                                .slice(0, 3)
                                .map((m, i) => (
                                  <span key={i} style={{ '--accent': accent(m) } as CSSProperties}>
                                    {m.model} ({count(m.turns)})
                                  </span>
                                ))}
                            </button>
                            {expanded === d.day && modelTable(d.models)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <p className={styles.meta}>{t('ledger.note')}</p>
        </>
      )}
    </div>
  );
}
