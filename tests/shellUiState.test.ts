/**
 * Shell chrome state (sidebar collapse).
 *
 * The default is the behaviour under test: a fresh CPAMC app window must open
 * collapsed, while an explicit toggle inside that session must stick.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  readShellUiState,
  readSidebarCollapsedDefault,
  writeShellUiState,
} from '@/components/layout/shellUiState';

const KEY = 'shell.uiState';

/** Test files share one process — leaving a fake `window` behind would leak. */
const originalWindow = (globalThis as { window?: unknown }).window;

function installSessionStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window: unknown }).window = { sessionStorage: storage };
  return storage;
}

let storage: ReturnType<typeof installSessionStorage>;

beforeEach(() => {
  storage = installSessionStorage();
});

afterAll(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

describe('shell ui state', () => {
  test('a fresh app window defaults to a collapsed sidebar', () => {
    expect(readShellUiState()).toBeNull();
    expect(readSidebarCollapsedDefault()).toBe(true);
  });

  test('an explicit expansion in the session is remembered', () => {
    writeShellUiState({ sidebarCollapsed: false });
    expect(readSidebarCollapsedDefault()).toBe(false);
    expect(readShellUiState()).toEqual({ sidebarCollapsed: false });
  });

  test('rejects values that are not part of the contract', () => {
    storage.setItem(KEY, JSON.stringify({ sidebarCollapsed: 'yes' }));
    expect(readShellUiState()).toEqual({ sidebarCollapsed: undefined });
    expect(readSidebarCollapsedDefault()).toBe(true);
  });

  test('survives absent, malformed, and non-object payloads', () => {
    expect(readShellUiState()).toBeNull();

    storage.setItem(KEY, '{not json');
    expect(readShellUiState()).toBeNull();

    storage.setItem(KEY, '"a string"');
    expect(readShellUiState()).toBeNull();
  });
});
