import { describe, expect, test } from 'bun:test';
import {
  apiBaseFromLocation,
  computeApiUrl,
  normalizeApiBase,
} from '@/utils/connection';

describe('management API connection address', () => {
  test('maps the local Vite frontend to the management backend port', () => {
    expect(
      apiBaseFromLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' })
    ).toBe('http://localhost:8317');
  });

  test('maps the Usage monitor CPAMC proxy to the management backend port', () => {
    expect(
      apiBaseFromLocation({
        protocol: 'http:',
        hostname: '192.168.1.64',
        port: '47193',
      })
    ).toBe('http://192.168.1.64:8317');
  });

  test('keeps a bundled backend origin and explicit management suffix stable', () => {
    expect(
      apiBaseFromLocation({ protocol: 'http:', hostname: 'localhost', port: '8317' })
    ).toBe('http://localhost:8317');
    expect(normalizeApiBase('localhost:8317/v0/management')).toBe(
      'http://localhost:8317'
    );
    expect(computeApiUrl('http://localhost:8317')).toBe(
      'http://localhost:8317/v0/management'
    );
  });

  test('repairs a saved frontend origin before restoring a session', () => {
    expect(normalizeApiBase('http://127.0.0.1:5173')).toBe('http://127.0.0.1:8317');
    expect(normalizeApiBase('http://192.168.1.64:47193')).toBe('http://192.168.1.64:8317');
    expect(computeApiUrl('http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:8317/v0/management'
    );
  });
});
