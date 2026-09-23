import { describe, expect, test } from 'bun:test';
import { requestCursorUsage } from '@/features/quota/providers/cursor/data';
import { requestMuseUsage } from '@/features/quota/providers/muse/data';
import { SidecarStaleError } from '@/utils/quota/sidecarFetch';

const stalePayload = { ok: true, stale: true, windows: [{ id: 'weekly', used: 12 }] };
const staleResponse = (() =>
  Promise.resolve(
    new Response(JSON.stringify(stalePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )) as typeof fetch;

describe('quota sidecar response freshness', () => {
  test('does not accept a declared stale meter as a successful reading', async () => {
    await expect(requestCursorUsage('http://sidecar.test/cursor', staleResponse)).rejects.toBeInstanceOf(
      SidecarStaleError
    );
    await expect(requestMuseUsage('http://sidecar.test/muse', staleResponse)).rejects.toBeInstanceOf(
      SidecarStaleError
    );
  });
});

describe('quota sidecar error translations', () => {
  const locales = ['en', 'ru', 'zh-CN', 'zh-TW'];
  const providers = ['cursor_quota', 'muse_quota'];

  test('keeps timeout and stale errors available in every supported locale', async () => {
    for (const locale of locales) {
      const catalog = (await Bun.file(`src/i18n/locales/${locale}.json`).json()) as Record<
        string,
        Record<string, unknown>
      >;
      for (const provider of providers) {
        expect(catalog[provider].timeout).toEqual(expect.any(String));
        expect(catalog[provider].stale_data).toEqual(expect.any(String));
      }
    }
  });
});
