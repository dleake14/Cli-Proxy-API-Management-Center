import { describe, expect, test } from 'bun:test';
import { isManagementConfigResponse } from '@/services/api/config';

describe('management config response', () => {
  test('rejects the Vite HTML fallback and empty or error objects', () => {
    expect(isManagementConfigResponse('<!doctype html><html></html>')).toBe(false);
    expect(isManagementConfigResponse({})).toBe(false);
    expect(isManagementConfigResponse({ error: 'missing management key' })).toBe(false);
  });

  test('accepts backend config objects', () => {
    expect(isManagementConfigResponse({ port: 8317, debug: false })).toBe(true);
    expect(isManagementConfigResponse({ debug: true })).toBe(true);
  });
});
