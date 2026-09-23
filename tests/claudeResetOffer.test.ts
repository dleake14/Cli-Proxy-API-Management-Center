import { beforeAll, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { ClaudeQuotaBody } from '@/features/quota/providers/claude/ClaudeQuotaBody';
import {
  CLAUDE_RESET_OFFERS,
  activeClaudeResetOffers,
} from '@/features/quota/providers/claude/resetOffer';
import { QUOTA_CLASS_KEYS, bindQuotaClasses } from '@/features/quota/types';
import type { ClaudeQuotaState } from '@/types';

const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'test-host'
);

const chicagoDate = (ms: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('Claude free reset offer', () => {
  const offer = CLAUDE_RESET_OFFERS.find((o) => o.id === 'opus-5-5-free-reset-2026-10-22');

  test('expires at the end of Oct 22 in America/Chicago', () => {
    expect(offer).toBeDefined();
    expect(chicagoDate(offer!.expiresAtMs)).toBe('Oct 22, 23:59');
    expect(chicagoDate(offer!.expiresAtMs + 1)).toBe('Oct 23, 00:00');
  });

  test('is active before expiry and gone after it', () => {
    const readAt = Date.UTC(2026, 8, 22, 16, 39);
    expect(activeClaudeResetOffers(readAt).map((o) => o.id)).toContain(offer!.id);
    expect(activeClaudeResetOffers(offer!.expiresAtMs - 1)).toHaveLength(1);
    expect(activeClaudeResetOffers(offer!.expiresAtMs)).toHaveLength(0);
  });

  test('Claude card shows only the short reset line', () => {
    const quota: ClaudeQuotaState = { status: 'success', windows: [] };
    const markup = renderToStaticMarkup(createElement(ClaudeQuotaBody, { quota, classes }));
    // Module-load clock is before Oct 22 2026 while this offer is live.
    if (Date.now() < offer!.expiresAtMs) {
      expect(markup).toContain('Reset available expires October 22nd');
      expect(markup).not.toContain('operator reading');
    } else {
      expect(markup).not.toContain('Reset available');
    }
  });
});
