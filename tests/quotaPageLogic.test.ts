import { describe, expect, test } from 'bun:test';
import { QUOTA_PAGE_SIZE, QUOTA_TAB_ORDER } from '@/features/quota/constants';
import {
  buildQuotaCardLabels,
  buildTabCounts,
  classifyQuotaFiles,
  filterEntriesByTab,
  isQuotaRefreshDisabled,
  paginate,
  resolveQuotaProviderType,
  sortQuotaEntries,
  type QuotaFileEntry,
} from '@/features/quota/logic';
import type { AuthFileItem } from '@/types';

const file = (name: string, provider: string, extra: Partial<AuthFileItem> = {}): AuthFileItem =>
  ({ name, provider, ...extra }) as AuthFileItem;

const FILES: AuthFileItem[] = [
  file('codex-a.json', 'codex'),
  file('claude-a.json', 'claude'),
  file('kimi-a.json', 'kimi'),
  file('codex-b.json', 'codex'),
  file('grok-a.json', 'grok'), // 别名归一到 xai
  file('gemini-a.json', 'gemini'), // 不支持额度
  file('claude-off.json', 'claude', { disabled: true }), // 停用
];

describe('resolveQuotaProviderType', () => {
  test('maps provider aliases and rejects unsupported or disabled files', () => {
    expect(resolveQuotaProviderType(file('a', 'grok'))).toBe('xai');
    expect(resolveQuotaProviderType(file('a', 'antigravity'))).toBe('antigravity');
    expect(resolveQuotaProviderType(file('a', 'gemini'))).toBeNull();
    expect(resolveQuotaProviderType(file('a', 'claude', { disabled: true }))).toBeNull();
  });
});

describe('classifyQuotaFiles', () => {
  test('uses the requested top-bar provider order', () => {
    expect(QUOTA_TAB_ORDER).toEqual(['codex', 'claude', 'xai', 'antigravity', 'ollama', 'kimi']);
  });

  test('drops unsupported and disabled files', () => {
    const entries = classifyQuotaFiles(FILES);
    expect(entries.map((entry) => entry.file.name)).not.toContain('gemini-a.json');
    expect(entries.map((entry) => entry.file.name)).not.toContain('claude-off.json');
    // 5 supported credentials + virtual Ollama card.
    expect(entries).toHaveLength(6);
  });

  test('orders entries by provider tab order', () => {
    const entries = classifyQuotaFiles(FILES);
    expect(entries.map((entry) => entry.type)).toEqual([
      'codex',
      'codex',
      'claude',
      'xai',
      'ollama',
      'kimi',
    ]);
  });
});

describe('classifyQuotaFiles — virtual Ollama card', () => {
  test('injects Ollama even though the backend can never list it', () => {
    // CLIProxyAPI has no native Ollama provider, so no auth file is ever returned
    // for it. The card must still appear, or the panel cannot show Ollama at all.
    const ollama = classifyQuotaFiles(FILES).filter((entry) => entry.type === 'ollama');
    expect(ollama).toHaveLength(1);
    expect(ollama[0].file.name).toBe('Ollama Cloud');
    expect(ollama[0].file.disabled).toBe(false);
  });

  test('stays out of the way when a real ollama credential exists (no duplicate card)', () => {
    const entries = classifyQuotaFiles([...FILES, file('ollama-key.json', 'ollama')]);
    const names = entries.filter((entry) => entry.type === 'ollama').map((entry) => entry.file.name);
    expect(names).toEqual(['ollama-key.json']);
  });

  test('is refreshable like any other card, not a disabled placeholder', () => {
    const entry = classifyQuotaFiles(FILES).find((item) => item.type === 'ollama');
    expect(entry).toBeDefined();
    // The card's refresh affordance is gated on `file.disabled` only, so an
    // enabled synthetic entry stays clickable exactly like a real credential.
    expect(entry?.file.disabled).toBe(false);
    expect(isQuotaRefreshDisabled(!entry?.file.disabled, false, false)).toBe(false);
  });
});

describe('buildTabCounts', () => {
  test('counts per provider plus an all total, zero-filling empty tabs', () => {
    expect(buildTabCounts(classifyQuotaFiles(FILES))).toEqual({
      all: 6,
      claude: 1,
      antigravity: 0,
      codex: 2,
      xai: 1,
      kimi: 1,
      ollama: 1,
    });
  });
});

describe('filterEntriesByTab', () => {
  const entries = classifyQuotaFiles(FILES);

  test("passes everything through on the 'all' tab", () => {
    expect(filterEntriesByTab(entries, 'all')).toHaveLength(6);
  });

  test('isolates the virtual Ollama card on its own tab', () => {
    expect(filterEntriesByTab(entries, 'ollama').map((entry) => entry.file.name)).toEqual([
      'Ollama Cloud',
    ]);
  });

  test('filters to a single provider', () => {
    expect(filterEntriesByTab(entries, 'codex').map((entry) => entry.file.name)).toEqual([
      'codex-a.json',
      'codex-b.json',
    ]);
    expect(filterEntriesByTab(entries, 'antigravity')).toEqual([]);
  });
});

describe('isQuotaRefreshDisabled', () => {
  test('blocks a single-card refresh while unavailable or loading', () => {
    expect(isQuotaRefreshDisabled(false, false)).toBe(true);
    expect(isQuotaRefreshDisabled(true, true)).toBe(true);
    expect(isQuotaRefreshDisabled(true, false)).toBe(false);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 45 }, (_, index) => index);

  test('uses the configured 20-item page size', () => {
    expect(QUOTA_PAGE_SIZE).toBe(20);
    expect(paginate(items, 2, QUOTA_PAGE_SIZE)).toEqual({
      pageItems: items.slice(20, 40),
      currentPage: 2,
      totalPages: 3,
    });
  });

  test('clamps an out-of-range page instead of returning an empty slice', () => {
    expect(paginate(items, 9, QUOTA_PAGE_SIZE).currentPage).toBe(3);
    expect(paginate(items, 9, QUOTA_PAGE_SIZE).pageItems).toEqual(items.slice(40));
    expect(paginate(items, 0, QUOTA_PAGE_SIZE).currentPage).toBe(1);
  });

  test('keeps at least one page when the list is empty', () => {
    expect(paginate([], 1, QUOTA_PAGE_SIZE)).toEqual({
      pageItems: [],
      currentPage: 1,
      totalPages: 1,
    });
  });
});

describe('sortQuotaEntries', () => {
  const entries = classifyQuotaFiles(FILES);
  const byName = (list: QuotaFileEntry[]) => list.map((entry) => entry.file.name);

  /** Recovery instants keyed by file name; anything absent resolves to null. */
  const resolver = (instants: Record<string, number>) => (entry: QuotaFileEntry) =>
    instants[entry.file.name] ?? null;

  test('default mode preserves order but returns a new array', () => {
    const sorted = sortQuotaEntries(entries, 'default', () => 1);
    expect(byName(sorted)).toEqual(byName(entries));
    expect(sorted).not.toBe(entries);
  });

  test('orders loaded credentials by how soon they recover, across providers', () => {
    const sorted = sortQuotaEntries(
      entries,
      'soonest',
      resolver({
        'codex-a.json': 300,
        'claude-a.json': 100,
        'kimi-a.json': 200,
        'codex-b.json': 400,
        'grok-a.json': 50,
      })
    );
    expect(byName(sorted)).toEqual([
      'grok-a.json',
      'claude-a.json',
      'kimi-a.json',
      'codex-a.json',
      'codex-b.json',
      'Ollama Cloud',
    ]);
  });

  test('sinks credentials with no instant, keeping their provider-grouped order', () => {
    // Loading is click-to-fetch, so an unloaded tail is the normal case.
    const sorted = sortQuotaEntries(
      entries,
      'soonest',
      resolver({ 'codex-b.json': 200, 'kimi-a.json': 100 })
    );
    expect(byName(sorted)).toEqual([
      'kimi-a.json',
      'codex-b.json',
      // unresolved tail, in the order classifyQuotaFiles produced
      'codex-a.json',
      'claude-a.json',
      'grok-a.json',
      'Ollama Cloud',
    ]);
  });

  test('leaves the order untouched when nothing has loaded', () => {
    expect(byName(sortQuotaEntries(entries, 'soonest', () => null))).toEqual(byName(entries));
  });

  test('breaks ties on the original position, so equal instants stay stable', () => {
    const sorted = sortQuotaEntries(entries, 'soonest', () => 500);
    expect(byName(sorted)).toEqual(byName(entries));
  });

  test('does not mutate the input', () => {
    const input = [...entries];
    sortQuotaEntries(input, 'soonest', resolver({ 'codex-b.json': 1 }));
    expect(input).toEqual(entries);
  });

  test('sorts before paginating, so the globally soonest lands on page one', () => {
    // Last in the default order, first to recover.
    const last = entries[entries.length - 1].file.name;
    const sorted = sortQuotaEntries(entries, 'soonest', resolver({ [last]: 1 }));
    expect(paginate(sorted, 1, 2).pageItems[0].file.name).toBe(last);
  });
});

describe('buildQuotaCardLabels', () => {
  const labelFor = (type: string) =>
    ({ codex: 'Codex', claude: 'Claude', xai: 'Grok', antigravity: 'Gemini', ollama: 'Ollama' })[
      type
    ] ?? type;

  test('uses the provider brand name when a provider has a single card', () => {
    const entries = classifyQuotaFiles([
      file('codex-9ca96e91-dleake14@gmail.com-prolite.json', 'codex'),
      file('antigravity-dleake14@gmail.com.json', 'antigravity'),
    ]);
    const labels = buildQuotaCardLabels(entries, labelFor);
    expect(labels.get('codex-9ca96e91-dleake14@gmail.com-prolite.json')).toBe('Codex');
    expect(labels.get('antigravity-dleake14@gmail.com.json')).toBe('Gemini');
  });

  test('keeps the runtime-only virtual card name as-is', () => {
    const entries = classifyQuotaFiles([]);
    const labels = buildQuotaCardLabels(entries, labelFor);
    expect(labels.get('Ollama Cloud')).toBe('Ollama Cloud');
  });

  test('appends an account hint when one provider has multiple cards', () => {
    const entries = classifyQuotaFiles([
      file('codex-a@gmail.com.json', 'codex', { email: 'a@gmail.com' }),
      file('codex-b@gmail.com.json', 'codex', { email: 'b@gmail.com' }),
    ]);
    const labels = buildQuotaCardLabels(entries, labelFor);
    expect(labels.get('codex-a@gmail.com.json')).toBe('Codex · a@gmail.com');
    expect(labels.get('codex-b@gmail.com.json')).toBe('Codex · b@gmail.com');
  });

  test('numbering keeps duplicate-account cards distinguishable', () => {
    const entries = classifyQuotaFiles([
      file('codex-1.json', 'codex', { email: 'a@gmail.com' }),
      file('codex-2.json', 'codex', { email: 'a@gmail.com' }),
      file('codex-3.json', 'codex'),
    ]);
    const labels = buildQuotaCardLabels(entries, labelFor);
    expect(labels.get('codex-1.json')).toBe('Codex · a@gmail.com');
    expect(labels.get('codex-2.json')).toBe('Codex · a@gmail.com #2');
    expect(labels.get('codex-3.json')).toBe('Codex · codex-3');
  });
});
