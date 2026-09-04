import { describe, expect, test } from 'bun:test';

const readSource = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe('quota management card actions', () => {
  test('keeps refresh quota as the only card action', async () => {
    const source = await readSource('src/features/quota/components/QuotaCard.tsx');

    expect(source).toContain("t('auth_files.quota_refresh_single')");
    expect(source).toContain('onClick={onRefresh}');
    expect(source).not.toContain('codex_quota.reset_button');
    expect(source).not.toContain('onReset');
    expect(source).not.toContain('showReset');
  });

  test('does not wire a reset callback into the quota management page', async () => {
    const source = await readSource('src/features/quota/QuotaPage.tsx');

    expect(source).toContain('const { refreshQuota } = useQuotaActions(disableControls);');
    expect(source).not.toContain('resetQuota } = useQuotaActions');
    expect(source).not.toContain('onReset=');
  });

  test('keeps reset support scoped to the auth-file page', async () => {
    const source = await readSource('src/features/authFiles/components/AuthFileQuotaSection.tsx');

    expect(source).toContain("t('codex_quota.reset_button')");
  });
});
