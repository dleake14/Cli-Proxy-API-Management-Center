import { describe, expect, test } from 'bun:test';
import {
  AUTH_FILES_RETRY_MAX_MS,
  AUTH_FILES_RETRY_MIN_MS,
  authFilesRetryDelayMs,
} from '@/features/quota/authFilesRetry';

describe('auth-file list retry backoff', () => {
  test('starts quickly and doubles to a bounded maximum', () => {
    expect(authFilesRetryDelayMs(1)).toBe(AUTH_FILES_RETRY_MIN_MS);
    expect(authFilesRetryDelayMs(2)).toBe(AUTH_FILES_RETRY_MIN_MS * 2);
    expect(authFilesRetryDelayMs(3)).toBe(AUTH_FILES_RETRY_MIN_MS * 4);
    expect(authFilesRetryDelayMs(99)).toBe(AUTH_FILES_RETRY_MAX_MS);
  });

  test('normalizes invalid failure counts to the first retry', () => {
    expect(authFilesRetryDelayMs(0)).toBe(AUTH_FILES_RETRY_MIN_MS);
    expect(authFilesRetryDelayMs(Number.NaN)).toBe(AUTH_FILES_RETRY_MIN_MS);
  });
});
