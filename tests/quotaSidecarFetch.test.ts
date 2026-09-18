import { describe, expect, test } from 'bun:test';
import {
  fetchSidecarResponse,
  fetchSidecarJson,
  isSidecarPayloadStale,
  SIDECAR_STALE_AFTER_MS,
  SidecarTimeoutError,
} from '@/utils/quota/sidecarFetch';

describe('quota sidecar fetch', () => {
  test('aborts a hanging fetch and permits a later recovery request', async () => {
    let aborted = false;
    const hanging = ((_url: string, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as typeof fetch;

    await expect(fetchSidecarResponse('http://sidecar.test', hanging, 1)).rejects.toBeInstanceOf(
      SidecarTimeoutError
    );
    expect(aborted).toBe(true);

    const recovered = await fetchSidecarResponse(
      'http://sidecar.test',
      (() => Promise.resolve(new Response('{}', { status: 200 }))) as typeof fetch,
      1
    );
    expect(recovered.status).toBe(200);
  });

  test('keeps the timeout through a body that stalls after headers, then recovers', async () => {
    let aborted = false;
    const headersThenStall = ((_url: string, options?: RequestInit) => {
      const signal = options?.signal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<never>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      } as Response);
    }) as typeof fetch;

    await expect(fetchSidecarJson('http://sidecar.test', headersThenStall, 1)).rejects.toBeInstanceOf(
      SidecarTimeoutError
    );
    expect(aborted).toBe(true);

    const recovered = await fetchSidecarJson<{ ok: boolean }>(
      'http://sidecar.test',
      (() => Promise.resolve(new Response('{"ok":true}', { status: 200 }))) as typeof fetch,
      1
    );
    expect(recovered.payload.ok).toBe(true);
  });

  test('deduplicates concurrent reads of the same sidecar endpoint', async () => {
    let calls = 0;
    let release: ((response: Response) => void) | undefined;
    const deferred = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchOnce = (() => {
      calls += 1;
      return deferred;
    }) as typeof fetch;

    const first = fetchSidecarJson<{ ok: boolean }>('http://single-flight.test', fetchOnce);
    const second = fetchSidecarJson<{ ok: boolean }>('http://single-flight.test', fetchOnce);
    expect(calls).toBe(1);
    release?.(new Response('{"ok":true}', { status: 200 }));

    const [left, right] = await Promise.all([first, second]);
    expect(left.payload.ok).toBe(true);
    expect(right.payload.ok).toBe(true);
  });

  test('does not mislabel a JSON parse failure as a timeout after abort', async () => {
    const malformedAfterAbort = ((_url: string, options?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise<never>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              reject(new SyntaxError('invalid JSON'));
            });
          }),
      } as Response)) as typeof fetch;

    await expect(
      fetchSidecarJson('http://malformed.test', malformedAfterAbort, 1)
    ).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe('quota sidecar freshness', () => {
  const now = Date.parse('2026-09-14T22:40:00Z');

  test('fails visibly for declared, per-window, and aged stale data', () => {
    expect(isSidecarPayloadStale({ stale: true }, now)).toBe(true);
    expect(isSidecarPayloadStale({ windows: [{ stale: true }] }, now)).toBe(true);
    expect(
      isSidecarPayloadStale(
        { fetched_at: new Date(now - SIDECAR_STALE_AFTER_MS - 1).toISOString() },
        now
      )
    ).toBe(true);
  });

  test('keeps a fresh or metadata-free response usable', () => {
    expect(isSidecarPayloadStale({ fetched_at: new Date(now - 1).toISOString() }, now)).toBe(false);
    expect(isSidecarPayloadStale({ windows: [{}] }, now)).toBe(false);
  });
});
