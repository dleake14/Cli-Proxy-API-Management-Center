import { describe, expect, test } from 'bun:test';
import { resolveUsageSidecarUrl } from '@/utils/quota/sidecarUrl';

describe('Usage quota sidecar URL', () => {
  test('uses the page hostname for a LAN browser', () => {
    expect(resolveUsageSidecarUrl('/muse-usage', undefined, { hostname: '192.168.1.10', port: '5173' })).toBe(
      'http://192.168.1.10:47193/muse-usage'
    );
  });

  test('keeps the existing Usage origin port', () => {
    expect(resolveUsageSidecarUrl('/cursor-usage', undefined, { hostname: 'ledger.local', port: '47193' })).toBe(
      'http://ledger.local:47193/cursor-usage'
    );
  });

  test('uses an explicit Vite endpoint without changing it', () => {
    expect(resolveUsageSidecarUrl('/muse-usage', 'https://usage.example/muse', { hostname: '192.168.1.10' })).toBe(
      'https://usage.example/muse'
    );
  });

  test('falls back to host loopback outside a browser', () => {
    expect(resolveUsageSidecarUrl('cursor-usage', undefined, undefined)).toBe(
      'http://127.0.0.1:47193/cursor-usage'
    );
  });

  test('does not double-bracket an already bracketed IPv6 browser hostname', () => {
    expect(resolveUsageSidecarUrl('/muse-usage', undefined, { hostname: '[::1]' })).toBe(
      'http://[::1]:47193/muse-usage'
    );
  });
});
