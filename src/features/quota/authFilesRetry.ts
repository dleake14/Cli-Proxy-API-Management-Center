/** Bounded retry backoff for a failed cold auth-file list. */

export const AUTH_FILES_RETRY_MIN_MS = 5_000;
export const AUTH_FILES_RETRY_MAX_MS = 60_000;

/** First failure retries after five seconds, then doubles up to one minute. */
export function authFilesRetryDelayMs(failureCount: number): number {
  const failures = Number.isFinite(failureCount) ? Math.max(1, Math.floor(failureCount)) : 1;
  const exponent = Math.min(4, failures - 1);
  return Math.min(AUTH_FILES_RETRY_MAX_MS, AUTH_FILES_RETRY_MIN_MS * 2 ** exponent);
}
